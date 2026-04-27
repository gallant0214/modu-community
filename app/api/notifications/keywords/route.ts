import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

// GET /api/notifications/keywords — 내 키워드 목록
export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { data, error } = await supabase
    .from("user_keywords")
    .select("id, keyword, created_at")
    .eq("firebase_uid", user.uid)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ keywords: data });
}

// POST /api/notifications/keywords — 키워드 전체 동기화
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const keywords: string[] = Array.isArray(body.keywords) ? body.keywords : [];
  const cleaned = keywords
    .map((k) => String(k || "").trim())
    .filter(Boolean)
    .slice(0, 20);

  // 전체 교체: 기존 삭제 후 insert
  await supabase.from("user_keywords").delete().eq("firebase_uid", user.uid);
  if (cleaned.length > 0) {
    await supabase
      .from("user_keywords")
      .insert(cleaned.map((keyword) => ({ firebase_uid: user.uid, keyword })));
  }

  return NextResponse.json({ success: true, count: cleaned.length });
}

// DELETE /api/notifications/keywords?keyword=xxx
export async function DELETE(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const url = new URL(request.url);
  const keyword = url.searchParams.get("keyword");
  if (!keyword) return NextResponse.json({ error: "keyword required" }, { status: 400 });

  const { error } = await supabase
    .from("user_keywords")
    .delete()
    .eq("firebase_uid", user.uid)
    .eq("keyword", keyword);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
