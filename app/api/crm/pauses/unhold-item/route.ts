import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

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

const KIND_TABLE: Record<string, "crm_memberships" | "crm_passes" | "crm_rentals"> = {
  membership: "crm_memberships",
  pass: "crm_passes",
  rental: "crm_rentals",
};
const KIND_COL: Record<string, "membership_id" | "pass_id" | "rental_id"> = {
  membership: "membership_id",
  pass: "pass_id",
  rental: "rental_id",
};

/**
 * POST /api/crm/pauses/unhold-item  { kind: 'membership'|'pass'|'rental', id }
 * 단일 이용권의 홀딩 해제.
 *  - 진행 중(active) 홀딩 기록 있으면: 연장했던 만료일(extended_days) 원복 + 기록 cancelled.
 *  - 기록 없는 '고아' 일시정지도: is_paused=false 로 해제.
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "manager" });
  if (isCrmError(ctx)) return ctx;

  let body: { kind?: string; id?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const kind = String(body.kind ?? "");
  const id = Number(body.id);
  const table = KIND_TABLE[kind];
  const col = KIND_COL[kind];
  if (!table || !id) {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  // 대상 이용권 확인 (센터 소속)
  const { data: item } = await supabase
    .from(table)
    .select("id, expires_at, is_paused")
    .eq("id", id)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!item) return NextResponse.json({ error: "이용권을 찾을 수 없습니다" }, { status: 404 });

  // 진행 중 홀딩 기록 조회 (is_paused 플래그보다 crm_pauses 를 진실 소스로 본다 —
  // is_paused 가 실제 홀딩 기록과 어긋난 케이스에서도 해제되도록)
  const { data: pause } = await supabase
    .from("crm_pauses")
    .select("id, extended_days, start_date")
    .eq("center_id", ctx.centerId)
    .eq("status", "active")
    .eq(col, id)
    .order("id", { ascending: false })
    .maybeSingle();

  if (!(item as { is_paused?: boolean }).is_paused && !pause) {
    return NextResponse.json({ error: "홀딩 중이 아닙니다" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { is_paused: false };
  const expiresAt = (item as { expires_at: string | null }).expires_at;
  const todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  let revert = 0;
  if (pause && expiresAt) {
    const p = pause as { extended_days: number | null; start_date: string | null };
    revert = revertDays(p.extended_days || 0, p.start_date, todayKst); // 안 쓴 남은 일수만 원복
    patch.expires_at = addDays(expiresAt, -revert);
  }

  await supabase.from(table).update(patch as never).eq("id", id).eq("center_id", ctx.centerId);

  if (pause) {
    await supabase
      .from("crm_pauses")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by_uid: ctx.uid,
      } as never)
      .eq("id", (pause as { id: number }).id);
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "pause.cancel",
    entity_type: table,
    entity_id: id,
    payload: { kind, reverted_days: revert, had_record: !!pause } as never,
  });

  return NextResponse.json({ ok: true, reverted_days: revert });
}
