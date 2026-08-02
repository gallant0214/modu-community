import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/member-app/unlink  { centerId }
 * 앱 계정과 이 센터 회원 정보의 "연동만 해제".
 *
 * - crm_members 레코드는 삭제하지 않는다(센터 CRM 데이터·이력 보존).
 * - linked_firebase_uid = NULL, member_type='provisional' 로 되돌려 앱에서 분리.
 *   (CHECK 제약: uid 없으면 member_type 은 provisional 이어야 함)
 * - 이 회원에게 가던 앱 푸시(메세지/쿠폰 등)를 끊기 위해 해당 디바이스 토큰 삭제.
 */
export async function POST(request: Request) {
  let body: { centerId?: number };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const ctx = await requireMemberForCenter(request, Number(body.centerId));
  if (isMemberError(ctx)) return ctx;

  const { error } = await supabase
    .from("crm_members")
    .update({ linked_firebase_uid: null, member_type: "provisional" } as never)
    .eq("id", ctx.memberId)
    .eq("center_id", ctx.centerId)
    .eq("linked_firebase_uid", ctx.uid); // 본인 연동분만
  if (error) {
    return NextResponse.json({ error: "연동 해제 실패", detail: error.message }, { status: 500 });
  }

  // 이 회원 앞으로 가던 푸시 토큰 제거 (센터 알림·쿠폰 중단)
  await supabase
    .from("crm_member_device_tokens")
    .delete()
    .eq("member_id", ctx.memberId)
    .eq("firebase_uid", ctx.uid);

  return NextResponse.json({ ok: true });
}
