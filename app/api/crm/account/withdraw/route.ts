import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { verifyAuth, getFirebaseAdmin } from "@/app/lib/firebase-admin";
import { getAuth } from "firebase-admin/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/account/withdraw
 * 강사 회원 탈퇴(계정 삭제).
 * - 이 계정의 모든 센터 소속(crm_center_members)을 status='deleted' 로 비활성화해 접근을 완전히 차단.
 *   (센터가 데이터 관리자로서 보관하는 회원·수강권·스케줄 등 업무 데이터는 보존)
 * - Firebase 계정을 삭제해 재로그인을 막는다.
 */
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  // 모든 센터 소속 비활성화 (접근 차단)
  const { error } = await supabase
    .from("crm_center_members")
    .update({ status: "deleted" } as never)
    .eq("firebase_uid", user.uid);
  if (error) {
    return NextResponse.json({ error: "탈퇴 처리 실패", detail: error.message }, { status: 500 });
  }

  // Firebase 계정 삭제 (재로그인 불가). 실패해도 소속 비활성화는 완료된 상태이므로 성공 처리.
  try {
    const admin = getFirebaseAdmin();
    await getAuth(admin).deleteUser(user.uid);
  } catch {
    // 계정이 이미 없거나 일시 오류 — 무시
  }

  return NextResponse.json({ ok: true });
}
