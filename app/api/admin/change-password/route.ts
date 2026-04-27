import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/change-password
 * Body: { password, newPassword }
 *
 * admin_settings 테이블에 비밀번호를 저장.
 * 환경변수 ADMIN_PASSWORD는 초기 비밀번호로만 사용.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { password, newPassword } = body;

  if (!password || !newPassword) {
    return NextResponse.json({ error: "현재 비밀번호와 새 비밀번호를 입력해주세요" }, { status: 400 });
  }

  if (newPassword.length < 8) {
    return NextResponse.json({ error: "새 비밀번호는 8자 이상이어야 합니다" }, { status: 400 });
  }

  if (newPassword.length > 100) {
    return NextResponse.json({ error: "비밀번호가 너무 깁니다" }, { status: 400 });
  }

  // 현재 비밀번호 확인 (verifyAdmin 사용)
  const authError = await verifyAdmin(request, password);
  if (authError) return authError;

  const { error } = await supabase
    .from("admin_settings")
    .upsert(
      {
        key: "admin_password",
        value: newPassword,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, message: "비밀번호가 변경되었습니다" });
}
