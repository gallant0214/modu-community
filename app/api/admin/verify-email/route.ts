import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { verifyAuth, isAdminUid } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/verify-email
 */
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user || !user.email) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  // 1순위: ADMIN_UIDS 부트스트랩
  if (isAdminUid(user.uid)) {
    return NextResponse.json({ success: true, email: user.email });
  }

  // 2순위: admin_emails 테이블 매칭
  const { count, error } = await supabase
    .from("admin_emails")
    .select("id", { count: "exact", head: true })
    .eq("email", user.email.toLowerCase());

  if (error) {
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }

  if ((count ?? 0) === 0) {
    return NextResponse.json({ error: "관리자로 등록되지 않은 이메일입니다" }, { status: 403 });
  }

  return NextResponse.json({ success: true, email: user.email });
}
