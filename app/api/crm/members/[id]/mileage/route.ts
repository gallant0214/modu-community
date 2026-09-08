import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/members/[id]/mileage  { delta, memo? }
 * 마일리지 증감(추가/차감) 조정.
 *
 * - 절대값 덮어쓰기(PATCH members)와 달리 서버에서 현재 잔액을 읽어 delta 를 적용 →
 *   동시 수정/화면 stale 로 인한 잔액 어긋남 방지.
 * - 회원앱 마일리지 내역에 보이도록 원장(crm_member_mileage_logs, reason='adjust') 기록.
 * - 권한: members.mileage
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const perms = await loadPermissionsForContext(ctx);
  if (!perms["members.mileage"]) {
    return NextResponse.json({ error: "마일리지 조정 권한이 없습니다" }, { status: 403 });
  }

  const { id } = await params;
  const memberId = Number(id);
  if (!memberId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  let body: { delta?: number | string; memo?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const delta = Math.trunc(Number(body.delta));
  if (!Number.isFinite(delta) || delta === 0) {
    return NextResponse.json({ error: "조정할 마일리지를 입력해 주세요" }, { status: 400 });
  }

  const { data: member } = await supabase
    .from("crm_members")
    .select("id, mileage")
    .eq("id", memberId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: "회원을 찾을 수 없습니다" }, { status: 404 });

  const before = member.mileage ?? 0;
  const after = before + delta;
  if (after < 0) {
    return NextResponse.json(
      { error: `보유 마일리지(${before.toLocaleString()}P)보다 많이 차감할 수 없어요` },
      { status: 400 }
    );
  }

  const { error: updErr } = await supabase
    .from("crm_members")
    .update({ mileage: after } as never)
    .eq("id", memberId)
    .eq("center_id", ctx.centerId);
  if (updErr) {
    return NextResponse.json({ error: "수정 실패", detail: updErr.message }, { status: 500 });
  }

  // 회원앱 마일리지 내역 원장
  await supabase.from("crm_member_mileage_logs").insert({
    center_id: ctx.centerId,
    member_id: memberId,
    delta,
    reason: "adjust",
    balance_after: after,
  } as never);

  // 활동 로그
  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "member.mileage_adjust",
    entity_type: "member",
    entity_id: memberId,
    payload: { delta, before, after, memo: (body.memo ?? "").trim() || null } as never,
  });

  return NextResponse.json({ ok: true, mileage: after, delta });
}
