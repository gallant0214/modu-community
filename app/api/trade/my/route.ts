export const dynamic = "force-dynamic";

import { supabase } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

// GET /api/trade/my — 내가 등록한 거래글 (firebase_uid 기준, 활성 status 만)
export async function GET(req: NextRequest) {
  const user = await verifyAuth(req);
  if (!user) {
    return NextResponse.json({ posts: [], error: "로그인이 필요합니다" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("trade_posts")
    .select("*")
    .eq("firebase_uid", user.uid)
    .neq("status", "deleted")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ posts: [], error: error.message }, { status: 500 });
  }
  return NextResponse.json({ posts: data || [] });
}
