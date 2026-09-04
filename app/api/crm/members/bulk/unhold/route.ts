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
  if (!startDate) return ext;
  const used = Math.max(0, dayDiff(startDate, todayKst));
  return Math.max(0, ext - used);
};

const TABLES = ["crm_memberships", "crm_passes", "crm_rentals"] as const;
type TableName = (typeof TABLES)[number];

/**
 * POST /api/crm/members/bulk/unhold — 선택 회원 일괄 홀딩 해제
 * 선택 회원의 is_paused=true 인 이용권(회원권·수강권·대여권)을 모두 해제.
 *  - 진행 중(active) 홀딩 기록(crm_pauses)이 있으면: 연장했던 만료일(extended_days)을 되돌리고
 *    그 기록을 cancelled 처리.
 *  - 홀딩 기록이 없는 '고아' 일시정지(과거 다른 경로로 is_paused 만 켜진 것)도: is_paused=false 로 해제.
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "manager" });
  if (isCrmError(ctx)) return ctx;

  let body: { member_ids?: number[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const memberIds = Array.from(
    new Set((body.member_ids ?? []).map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0))
  );
  if (memberIds.length === 0) {
    return NextResponse.json({ error: "회원을 선택해 주세요" }, { status: 400 });
  }

  // 1) is_paused=true 이용권 로드 (테이블별, 선택 회원)
  type Held = { table: TableName; id: number; member_id: number; expires_at: string | null };
  const held: Held[] = [];
  for (const table of TABLES) {
    for (let i = 0; i < memberIds.length; i += 200) {
      const chunk = memberIds.slice(i, i + 200);
      const { data, error } = await supabase
        .from(table)
        .select("id, member_id, expires_at")
        .eq("center_id", ctx.centerId)
        .eq("is_paused", true)
        .in("member_id", chunk);
      if (error) {
        return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
      }
      for (const r of (data ?? []) as { id: number; member_id: number; expires_at: string | null }[]) {
        held.push({ table, id: r.id, member_id: r.member_id, expires_at: r.expires_at });
      }
    }
  }

  if (held.length === 0) {
    return NextResponse.json({ ok: true, members_affected: 0, items_unheld: 0, skipped: memberIds.length });
  }

  // 2) 이 회원들의 active 홀딩 기록 → (테이블:항목id) 로 매핑
  const pauseByItem = new Map<string, { pauseId: number; extended_days: number; start_date: string | null }>();
  for (let i = 0; i < memberIds.length; i += 200) {
    const chunk = memberIds.slice(i, i + 200);
    const { data } = await supabase
      .from("crm_pauses")
      .select("id, pass_id, membership_id, rental_id, extended_days, start_date")
      .eq("center_id", ctx.centerId)
      .eq("status", "active")
      .in("member_id", chunk);
    for (const p of (data ?? []) as {
      id: number;
      pass_id: number | null;
      membership_id: number | null;
      rental_id: number | null;
      extended_days: number | null;
      start_date: string | null;
    }[]) {
      const table: TableName = p.pass_id ? "crm_passes" : p.membership_id ? "crm_memberships" : "crm_rentals";
      const targetId = p.pass_id ?? p.membership_id ?? p.rental_id;
      if (targetId) pauseByItem.set(`${table}:${targetId}`, { pauseId: p.id, extended_days: p.extended_days || 0, start_date: p.start_date });
    }
  }

  // 3) 각 일시정지 항목 해제 (조기 해제 = 안 쓴 남은 일수만 원복)
  const todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  let unheld = 0;
  const affected = new Set<number>();
  for (const h of held) {
    const pause = pauseByItem.get(`${h.table}:${h.id}`);
    const patch: Record<string, unknown> = { is_paused: false };
    if (pause && h.expires_at) {
      const revert = revertDays(pause.extended_days, pause.start_date, todayKst);
      patch.expires_at = addDays(h.expires_at, -revert);
    }
    await supabase.from(h.table).update(patch as never).eq("id", h.id).eq("center_id", ctx.centerId);
    if (pause) {
      await supabase
        .from("crm_pauses")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancelled_by_uid: ctx.uid,
        } as never)
        .eq("id", pause.pauseId);
    }
    unheld++;
    affected.add(h.member_id);
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "members.bulk_unhold",
    entity_type: "crm_members",
    entity_id: null,
    payload: { member_ids: memberIds, members_affected: affected.size, items_unheld: unheld } as never,
  });

  return NextResponse.json({
    ok: true,
    members_affected: affected.size,
    items_unheld: unheld,
    skipped: memberIds.length - affected.size,
  });
}
