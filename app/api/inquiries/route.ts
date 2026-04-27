import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { sanitize, checkRateLimit, getClientIp, validateLength } from "@/app/lib/security";
import { verifyAuth, isAdminUid } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

// GET /api/inquiries — 관리자 전용 전체 목록 조회
export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  let isAdmin = isAdminUid(user.uid);
  if (!isAdmin && user.email) {
    const { count } = await supabase
      .from("admin_emails")
      .select("id", { count: "exact", head: true })
      .eq("email", user.email.toLowerCase());
    if ((count ?? 0) > 0) isAdmin = true;
  }
  if (!isAdmin) {
    return NextResponse.json({ error: "관리자만 조회할 수 있습니다" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("inquiries")
    .select("id, author, title, reply, replied_at, hidden, created_at, firebase_uid")
    .or("hidden.eq.false,hidden.is.null")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인을 해주세요" }, { status: 401 });

  const ip = getClientIp(request);
  const rateLimitResponse = checkRateLimit(ip, "write");
  if (rateLimitResponse) return rateLimitResponse;

  const body = await request.json();
  const { author, password, email, title, content } = body;

  if (!author?.trim() || !title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "제목과 내용을 입력해주세요" }, { status: 400 });
  }

  const { error } = await supabase.from("inquiries").insert({
    author: sanitize(validateLength(author.trim(), 50)),
    password: (password || user.uid).trim(),
    email: sanitize(validateLength((email || "").trim(), 100)),
    title: sanitize(validateLength(title.trim(), 200)),
    content: sanitize(validateLength(content.trim(), 10000)),
    firebase_uid: user.uid,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
