import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import {
  HOLD_COL,
  HOLD_TABLE,
  findBundleSiblings,
  loadHoldRow,
  type HoldKind,
  type HoldRow,
} from "@/app/lib/crm-hold-group";
import { syncLockerDatesFromRental } from "@/app/lib/crm-locker-sync";

export const dynamic = "force-dynamic";

const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayDiff = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
/** 조기 해제 시 되돌릴 일수 = 안 쓴(남은) 홀딩 일수. 실제 정지된 기간은 유지. */
const revertDays = (extendedDays: number, startDate: string | null, todayKst: string) => {
  const ext = Math.max(0, extendedDays || 0);
  if (!startDate) return ext; // 시작일 불명 → 전체 원복(하위호환)
  const used = Math.max(0, dayDiff(startDate, todayKst)); // 시작일~오늘 = 실제 정지 일수
  return Math.max(0, ext - used);
};


/**
 * POST /api/crm/pauses/unhold-item  { kind: 'membership'|'pass'|'rental', id, include_bundle? }
 * 이용권 홀딩 해제.
 *  - 진행 중(active) 홀딩 기록 있으면: 안 쓴 연장분 원복 + 기록 cancelled.
 *  - 기록 없는 '고아' 일시정지도: is_paused=false 로 해제.
 *  - 묶음(번들)로 함께 발급된 형제 상품(±3초)도 함께 해제한다 (include_bundle=false 로 끌 수 있음).
 *  - 락커 대여권이면 물리 락커(crm_lockers) 만료일도 함께 원복.
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "manager" });
  if (isCrmError(ctx)) return ctx;

  let body: { kind?: string; id?: number; include_bundle?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const kind = String(body.kind ?? "") as HoldKind;
  const id = Number(body.id);
  if (!HOLD_TABLE[kind] || !id) {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const base = await loadHoldRow(ctx.centerId, kind, id);
  if (!base) return NextResponse.json({ error: "이용권을 찾을 수 없습니다" }, { status: 404 });

  // 묶음 형제까지 해제 대상에 포함 (홀딩 중인 것만)
  const targets: HoldRow[] = [base];
  if (body.include_bundle !== false) {
    for (const sib of await findBundleSiblings(ctx.centerId, base)) {
      if (!targets.some((t) => t.kind === sib.kind && t.id === sib.id)) targets.push(sib);
    }
  }

  const todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const released: { kind: HoldKind; id: number; name: string; reverted_days: number }[] = [];

  for (const row of targets) {
    const isBase = row.kind === base.kind && row.id === base.id;

    // 진행 중 홀딩 기록 (is_paused 플래그보다 crm_pauses 를 진실 소스로)
    const { data: pauseRow } = await supabase
      .from("crm_pauses")
      .select("id, extended_days, start_date")
      .eq("center_id", ctx.centerId)
      .eq("status", "active")
      .eq(HOLD_COL[row.kind], row.id)
      .order("id", { ascending: false })
      .maybeSingle();
    const pause = pauseRow as { id: number; extended_days: number | null; start_date: string | null } | null;

    if (!row.is_paused && !pause) {
      // 대상 본인이 홀딩 중이 아니면 에러, 묶음 형제면 조용히 건너뜀
      if (isBase) return NextResponse.json({ error: "홀딩 중이 아닙니다" }, { status: 400 });
      continue;
    }

    const patch: Record<string, unknown> = { is_paused: false };
    let revert = 0;
    if (pause && row.expires_at) {
      revert = revertDays(pause.extended_days || 0, pause.start_date, todayKst);
      patch.expires_at = addDays(row.expires_at, -revert);
    }

    await supabase
      .from(HOLD_TABLE[row.kind])
      .update(patch as never)
      .eq("id", row.id)
      .eq("center_id", ctx.centerId);

    // 락커 대여권이면 물리 락커 만료일도 함께 원복
    if (row.kind === "rental" && patch.expires_at) {
      await syncLockerDatesFromRental(
        ctx.centerId,
        { member_id: row.member_id, item_name: row.item_name ?? row.name, memo: row.memo ?? null },
        { expires_at: patch.expires_at as string }
      );
    }

    if (pause) {
      await supabase
        .from("crm_pauses")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancelled_by_uid: ctx.uid,
        } as never)
        .eq("id", pause.id);
    }

    await supabase.from("crm_audit_logs").insert({
      center_id: ctx.centerId,
      actor_uid: ctx.uid,
      action: "pause.cancel",
      entity_type: HOLD_TABLE[row.kind],
      entity_id: row.id,
      payload: {
        kind: row.kind,
        reverted_days: revert,
        had_record: !!pause,
        bundled: !isBase,
      } as never,
    });

    released.push({ kind: row.kind, id: row.id, name: row.name, reverted_days: revert });
  }

  if (released.length === 0) {
    return NextResponse.json({ error: "홀딩 중이 아닙니다" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    released,
    // 하위호환
    reverted_days: released[0].reverted_days,
  });
}
