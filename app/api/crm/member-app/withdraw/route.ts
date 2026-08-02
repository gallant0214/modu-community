import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/member-app/withdraw
 * 회원탈퇴 — 앱 계정과 연결된 모든 센터 연동을 끊고 푸시 토큰 삭제.
 *
 * - crm_members 레코드 자체는 삭제하지 않는다(센터가 데이터 관리자로서 보관/삭제).
 *   대신 linked_firebase_uid=NULL, member_type='provisional' 로 되돌려 앱 계정과 분리.
 * - 이 uid 의 모든 디바이스 토큰 삭제(센터 알림·쿠폰 등 완전 중단).
 * - Firebase 계정 삭제는 클라이언트(auth.currentUser.delete)에서 수행.
 */
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  // 모든 센터의 내 연동 회원 분리 (데이터는 보존)
  const { error } = await supabase
    .from("crm_members")
    .update({ linked_firebase_uid: null, member_type: "provisional" } as never)
    .eq("linked_firebase_uid", user.uid);
  if (error) {
    return NextResponse.json({ error: "탈퇴 처리 실패", detail: error.message }, { status: 500 });
  }

  // 이 계정의 모든 푸시 토큰 삭제
  await supabase.from("crm_member_device_tokens").delete().eq("firebase_uid", user.uid);

  return NextResponse.json({ ok: true });
}
