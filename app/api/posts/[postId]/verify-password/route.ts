import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/app/lib/security";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const ip = getClientIp(request);
  const rateLimitResponse = checkRateLimit(ip, "auth");
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

  const isAdmin = password === process.env.ADMIN_PASSWORD;
  if (!isAdmin && data.password !== password) {
    return NextResponse.json({ error: "비밀번호가 일치하지 않습니다" }, { status: 403 });
  }
  return NextResponse.json({ success: true });
}
