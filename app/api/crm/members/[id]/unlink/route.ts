import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/members/[id]/unlink
 * CRM(직원) 측에서 이 회원의 앱 계정 연동을 해제.
 *
 * - crm_members 레코드는 유지(센터 이력 보존). linked_firebase_uid=NULL,
 *   member_type='provisional' 로 되돌림(CHECK: uid 없으면 provisional).
 * - 이 회원 앞으로 가던 앱 푸시 토큰 제거(연동 계정 기준).
 * 권한: members.edit_basic (회원 기본정보 수정 권한).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const perms = await loadPermissionsForContext(ctx);
  if (!perms["members.edit_basic"]) {
    return NextResponse.json({ error: "앱 연동을 해제할 권한이 없습니다" }, { status: 403 });
  }

  const { id } = await params;
  const memberId = Number(id) || 0;
  if (!memberId) {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { data: member } = await supabase
    .from("crm_members")
    .select("id, name, linked_firebase_uid")
    .eq("id", memberId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!member) {
    return NextResponse.json({ error: "회원을 찾을 수 없어요" }, { status: 404 });
  }
  const linkedUid = (member as { linked_firebase_uid: string | null }).linked_firebase_uid;
  if (!linkedUid) {
    return NextResponse.json({ error: "앱과 연동되어 있지 않은 회원이에요" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_members")
    .update({ linked_firebase_uid: null, member_type: "provisional" } as never)
    .eq("id", memberId)
    .eq("center_id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "연동 해제 실패", detail: error.message }, { status: 500 });
  }

  // 이 회원 앞으로 가던 앱 푸시 토큰 제거 (member_id 또는 연동 uid 기준)
  await supabase
    .from("crm_member_device_tokens")
    .delete()
    .or(`member_id.eq.${memberId},firebase_uid.eq.${linkedUid}`);

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "member.app_unlink",
    entity_type: "crm_members",
    entity_id: memberId,
    payload: { unlinked_uid: linkedUid } as never,
  });

  return NextResponse.json({ ok: true });
}
