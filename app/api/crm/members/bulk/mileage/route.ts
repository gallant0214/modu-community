import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/members/bulk/mileage — 선택 회원 일괄 마일리지 지급/차감
 * body: { member_ids: number[], amount: number (+지급/-차감), reason?: string }
 * 각 회원 crm_members.mileage 를 amount 만큼 증감 (0 미만이면 0 으로 clamp).
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "members.mileage"))) {
    return NextResponse.json({ error: "마일리지를 조정할 권한이 없습니다" }, { status: 403 });
  }

  let body: { member_ids?: number[]; amount?: number; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const memberIds = Array.from(
    new Set((body.member_ids ?? []).map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0))
  );
  if (memberIds.length === 0) return NextResponse.json({ error: "회원을 선택해 주세요" }, { status: 400 });

  const amount = Math.trunc(Number(body.amount) || 0);
  if (amount === 0) return NextResponse.json({ error: "지급/차감할 마일리지를 입력해 주세요" }, { status: 400 });

  const { data: members, error } = await supabase
    .from("crm_members")
    .select("id, mileage")
    .eq("center_id", ctx.centerId)
    .in("id", memberIds);
  if (error) return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  if (!members || members.length === 0) {
    return NextResponse.json({ ok: true, members_affected: 0 });
  }

  const updates = members.map((m) => ({
    id: m.id,
    next: Math.max(0, (m.mileage ?? 0) + amount),
  }));

  for (let i = 0; i < updates.length; i += 25) {
    const chunk = updates.slice(i, i + 25);
    await Promise.all(
      chunk.map((u) =>
        supabase
          .from("crm_members")
          .update({ mileage: u.next } as never)
          .eq("id", u.id)
          .eq("center_id", ctx.centerId)
      )
    );
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "members.bulk_mileage",
    entity_type: "crm_members",
    entity_id: null,
    payload: {
      member_ids: memberIds,
      members_affected: members.length,
      amount,
      reason: body.reason ?? null,
    } as never,
  });

  return NextResponse.json({ ok: true, members_affected: members.length, amount });
}
