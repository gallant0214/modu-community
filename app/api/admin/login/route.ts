import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { checkRateLimit, getClientIp } from "@/app/lib/security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rateLimitResponse = await checkRateLimit(ip, "auth");
  if (rateLimitResponse) return rateLimitResponse;

  const body = await request.json();
  const { password } = body;

  // 신고·문의 목록(이메일 포함)을 돌려주므로 관리자 구글 로그인 + 비밀번호 둘 다 필요.
  // (커뮤니티 앱 관리자 화면은 로그인 토큰을 안 보내서 예전부터 401 — 2026-11-06 확인)
  const authError = await verifyAdmin(request, password);
  if (authError) return authError;

  const [reportsRes, inquiriesRes] = await Promise.all([
    supabase.rpc("admin_reports_with_targets"),
    supabase
      .from("inquiries")
      .select("id, author, email, title, content, reply, replied_at, hidden, read_at, created_at")
      .order("created_at", { ascending: false }),
  ]);

  if (reportsRes.error) {
    return NextResponse.json({ error: reportsRes.error.message }, { status: 500 });
  }
  if (inquiriesRes.error) {
    return NextResponse.json({ error: inquiriesRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    reports: reportsRes.data,
    inquiries: inquiriesRes.data,
  });
}
