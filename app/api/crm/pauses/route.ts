import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import {
  HOLD_TABLE,
  findBundleSiblings,
  loadHoldRow,
  type HoldKind,
  type HoldRow,
} from "@/app/lib/crm-hold-group";
import { syncLockerDatesFromRental } from "@/app/lib/crm-locker-sync";

export const dynamic = "force-dynamic";

const dayDiff = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / (24 * 3600 * 1000));

const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * GET /api/crm/pauses?member_id=&pass_id=&membership_id=
 * 홀딩 내역 조회 (취소 포함).
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const memberId = url.searchParams.get("member_id");
  const passId = url.searchParams.get("pass_id");
  const membershipId = url.searchParams.get("membership_id");

  let q = supabase
    .from("crm_pauses")
    .select(
      "id, member_id, pass_id, membership_id, rental_id, start_date, end_date, reason, requested_by, status, extended_days, created_at, cancelled_at"
    )
    .eq("center_id", ctx.centerId)
    .order("start_date", { ascending: false })
    .limit(200);

  if (memberId) q = q.eq("member_id", Number(memberId));
  if (passId) q = q.eq("pass_id", Number(passId));
  if (membershipId) q = q.eq("membership_id", Number(membershipId));

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ pauses: data ?? [] });
}

/**
 * POST /api/crm/pauses — 홀딩 시작
 *
 * Body:
 *   { pass_id?, membership_id?, rental_id?, items?: [{kind,id}], start_date, end_date,
 *     reason?, requested_by?, include_bundle?: boolean(기본 true) }
 *
 * - 시작/종료일로 즉시 expires_at 을 (end - start + 1) 일 만큼 연장하고 is_paused = true.
 * - 여러 상품을 한 번에 홀딩할 수 있다(items). 회원권만 홀딩하고 락커는 그대로 남아
 *   만료일이 어긋나는 사고를 막기 위함.
 * - 묶음(번들) 상품: 같은 결제로 함께 발급된 형제 상품(±3초)은 자동으로 함께 홀딩된다.
 *   (include_bundle=false 로 끌 수 있음)
 * - 락커 대여권을 홀딩하면 물리 락커(crm_lockers) 만료일도 같이 밀린다.
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  let body: {
    pass_id?: number;
    membership_id?: number;
    rental_id?: number;
    items?: { kind?: string; id?: number }[];
    start_date?: string;
    end_date?: string;
    reason?: string;
    requested_by?: string;
    include_bundle?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const start = (body.start_date ?? "").slice(0, 10);
  const end = (body.end_date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return NextResponse.json({ error: "홀딩 기간을 입력해 주세요" }, { status: 400 });
  }
  if (end < start) {
    return NextResponse.json({ error: "종료일이 시작일보다 빠를 수 없어요" }, { status: 400 });
  }

  // 요청 대상 수집 (legacy 단일 필드 + items 배열)
  const requested: { kind: HoldKind; id: number }[] = [];
  const pushReq = (kind: HoldKind, id: number | null | undefined) => {
    const n = Number(id);
    if (Number.isFinite(n) && n > 0 && !requested.some((r) => r.kind === kind && r.id === n)) {
      requested.push({ kind, id: n });
    }
  };
  pushReq("pass", body.pass_id);
  pushReq("membership", body.membership_id);
  pushReq("rental", body.rental_id);
  for (const it of body.items ?? []) {
    const k = String(it?.kind ?? "");
    if (k === "pass" || k === "membership" || k === "rental") pushReq(k, it?.id);
  }
  if (requested.length === 0) {
    return NextResponse.json({ error: "홀딩할 대상을 선택해 주세요" }, { status: 400 });
  }

  // 대상 로드 + 묶음 형제 자동 확장
  const includeBundle = body.include_bundle !== false;
  const targets = new Map<string, HoldRow>();
  const skipped: { kind: HoldKind; id: number; name: string; reason: string }[] = [];
  for (const req of requested) {
    const row = await loadHoldRow(ctx.centerId, req.kind, req.id);
    if (!row) {
      skipped.push({ ...req, name: "", reason: "대상을 찾을 수 없어요" });
      continue;
    }
    targets.set(`${row.kind}:${row.id}`, row);
    if (includeBundle) {
      for (const sib of await findBundleSiblings(ctx.centerId, row)) {
        const key = `${sib.kind}:${sib.id}`;
        if (!targets.has(key)) targets.set(key, sib);
      }
    }
  }

  const days = dayDiff(start, end) + 1; // inclusive 양 끝 포함
  const held: {
    kind: HoldKind;
    id: number;
    name: string;
    new_expires_at: string;
    bundled: boolean;
  }[] = [];

  for (const row of targets.values()) {
    const explicit = requested.some((r) => r.kind === row.kind && r.id === row.id);
    if (row.status !== "valid") {
      skipped.push({
        kind: row.kind,
        id: row.id,
        name: row.name,
        reason: "유효한 이용권만 홀딩할 수 있어요",
      });
      continue;
    }
    if (row.is_paused) {
      skipped.push({
        kind: row.kind,
        id: row.id,
        name: row.name,
        reason: "이미 진행중인 홀딩이 있어요",
      });
      continue;
    }

    const newExpires = addDays(row.expires_at, days);

    // 1) 홀딩 기록 생성
    const { error: pErr } = await supabase.from("crm_pauses").insert({
      center_id: ctx.centerId,
      member_id: row.member_id,
      pass_id: row.kind === "pass" ? row.id : null,
      membership_id: row.kind === "membership" ? row.id : null,
      rental_id: row.kind === "rental" ? row.id : null,
      start_date: start,
      end_date: end,
      reason: body.reason?.trim() || null,
      requested_by: body.requested_by?.trim() || null,
      status: "active",
      extended_days: days,
      created_by_uid: ctx.uid,
    });
    if (pErr) {
      skipped.push({ kind: row.kind, id: row.id, name: row.name, reason: "홀딩 기록 실패" });
      continue;
    }

    // 2) 만료일 연장 + is_paused 표시
    const { error: uErr } = await supabase
      .from(HOLD_TABLE[row.kind])
      .update({ expires_at: newExpires, is_paused: true } as never)
      .eq("id", row.id)
      .eq("center_id", ctx.centerId);
    if (uErr) {
      skipped.push({ kind: row.kind, id: row.id, name: row.name, reason: "상태 갱신 실패" });
      continue;
    }

    // 3) 락커 대여권이면 물리 락커 만료일도 함께 연장
    if (row.kind === "rental") {
      await syncLockerDatesFromRental(
        ctx.centerId,
        { member_id: row.member_id, item_name: row.item_name ?? row.name, memo: row.memo ?? null },
        { expires_at: newExpires }
      );
    }

    await supabase.from("crm_audit_logs").insert({
      center_id: ctx.centerId,
      actor_uid: ctx.uid,
      action: "pause.create",
      entity_type: HOLD_TABLE[row.kind],
      entity_id: row.id,
      payload: {
        start,
        end,
        days,
        reason: body.reason,
        requested_by: body.requested_by,
        bundled: !explicit,
      } as never,
    });

    held.push({
      kind: row.kind,
      id: row.id,
      name: row.name,
      new_expires_at: newExpires,
      bundled: !explicit,
    });
  }

  if (held.length === 0) {
    return NextResponse.json(
      { error: skipped[0]?.reason || "홀딩할 수 있는 상품이 없어요", skipped },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    extended_days: days,
    held,
    skipped,
    // 하위호환 (단일 대상 응답을 쓰던 화면용)
    new_expires_at: held[0].new_expires_at,
  });
}
