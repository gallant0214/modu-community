export const dynamic = "force-dynamic";

import { supabase } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

// GET /api/comments/my — 내가 댓글 단 게시글 (firebase_uid 기반)
export async function GET(req: NextRequest) {
  const user = await verifyAuth(req);
  if (!user) {
    return NextResponse.json({ comments: [], error: "로그인이 필요합니다" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("comments")
    .select(
      "id, post_id, content, created_at, posts!inner(category_id, title, categories(name))",
    )
    .eq("firebase_uid", user.uid)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json({ comments: [], error: error.message }, { status: 500 });
  }

  const comments = data.map((c) => ({
    id: c.id,
    post_id: c.post_id,
    content: c.content,
    created_at: c.created_at,
    category_id: c.posts?.category_id ?? null,
    post_title: c.posts?.title ?? null,
    category_name: c.posts?.categories?.name ?? null,
  }));

  return NextResponse.json({ comments });
}
