import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * POST /api/crm/members/bulk/unhold — 선택 회원 일괄 홀딩 해제
 * 각 회원의 진행 중(active) 홀딩(crm_pauses)을 취소하고, 홀딩 시 연장했던 만료일
 * (extended_days)만큼 되돌린 뒤 is_paused=false 로 복구. (개별 해제 pauses/[id] DELETE 와 동일 규칙)
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

  type Pause = {
    id: number;
    member_id: number;
    pass_id: number | null;
    membership_id: number | null;
    rental_id: number | null;
    extended_days: number | null;
  };
  const pauses: Pause[] = [];
  for (let i = 0; i < memberIds.length; i += 200) {
    const chunk = memberIds.slice(i, i + 200);
    const { data, error } = await supabase
      .from("crm_pauses")
      .select("id, member_id, pass_id, membership_id, rental_id, extended_days")
      .eq("center_id", ctx.centerId)
      .eq("status", "active")
      .in("member_id", chunk);
    if (error) {
      return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
    }
    pauses.push(...((data ?? []) as Pause[]));
  }

  if (pauses.length === 0) {
    return NextResponse.json({ ok: true, members_affected: 0, items_unheld: 0, skipped: memberIds.length });
  }

  let unheld = 0;
  const affected = new Set<number>();
  for (const p of pauses) {
    const table = p.pass_id ? "crm_passes" : p.membership_id ? "crm_memberships" : "crm_rentals";
    const targetId = (p.pass_id ?? p.membership_id ?? p.rental_id) as number | null;
    if (!targetId) continue;

    const { data: target } = await supabase
      .from(table)
      .select("expires_at")
      .eq("id", targetId)
      .eq("center_id", ctx.centerId)
      .maybeSingle();

    if (target && (target as { expires_at: string | null }).expires_at) {
      const restored = addDays(
        (target as { expires_at: string }).expires_at,
        -Math.max(0, p.extended_days || 0)
      );
      await supabase
        .from(table)
        .update({ expires_at: restored, is_paused: false } as never)
        .eq("id", targetId)
        .eq("center_id", ctx.centerId);
    } else {
      // 만료일 없는(무기한 등) 경우 일시정지만 해제
      await supabase
        .from(table)
        .update({ is_paused: false } as never)
        .eq("id", targetId)
        .eq("center_id", ctx.centerId);
    }

    await supabase
      .from("crm_pauses")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by_uid: ctx.uid,
      } as never)
      .eq("id", p.id);

    unheld++;
    affected.add(p.member_id);
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
