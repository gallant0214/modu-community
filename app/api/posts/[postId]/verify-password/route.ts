import { supabase } from "@/app/lib/supabase";
import { verifyAdminPassword } from "@/app/lib/admin-auth";
import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/app/lib/security";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const ip = getClientIp(request);
  const rateLimitResponse = await checkRateLimit(ip, "auth");
  if (rateLimitResponse) return rateLimitResponse;

  const { postId } = await params;
  const { password } = await request.json();

  const { data, error } = await supabase
    .from("posts")
    .select("password")
    .eq("id", Number(postId))
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다" }, { status: 404 });
  }

  // 글 비밀번호가 맞으면 끝. 틀렸을 때만 관리자 만능 비밀번호 비교(실패 잠금 적용)
  const isAdmin = data.password !== password && !!password && (await verifyAdminPassword(password));
  if (!isAdmin && data.password !== password) {
    return NextResponse.json({ error: "비밀번호가 일치하지 않습니다" }, { status: 403 });
  }
  return NextResponse.json({ success: true });
}
