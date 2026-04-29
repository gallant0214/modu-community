export const dynamic = "force-dynamic";

import { supabase } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

// GET /api/users/blocks — 내가 차단한 사용자 목록
export async function GET(req: NextRequest) {
  const user = await verifyAuth(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { data, error } = await supabase
    .from("user_blocks")
    .select("blocked_uid, blocked_nickname, created_at")
    .eq("blocker_uid", user.uid)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ blocks: data || [] });
}
