import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/inquiries/mine
 * 현재 로그인한 firebase 사용자의 최근 문의 20건.
 * 답변 유무 파악용. (CRM 센터설정 > 문의하기 탭에서 사용)
 */
export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("inquiries")
    .select("id, title, content, reply, replied_at, created_at, hidden")
    .eq("firebase_uid", user.uid)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ inquiries: data ?? [] });
}
