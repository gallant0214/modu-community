import { supabase } from "@/app/lib/supabase";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ commentId: string }> }
) {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인을 해주세요" }, { status: 401 });
  }

  const { commentId } = await params;
  const cid = Number(commentId);

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

  const { data: existing } = await supabase
    .from("comment_likes")
    .select("id")
    .eq("comment_id", cid)
    .eq("firebase_uid", user.uid)
    .maybeSingle();

  let unliked = false;

  if (existing) {
    await supabase
      .from("comment_likes")
      .delete()
      .eq("comment_id", cid)
      .eq("firebase_uid", user.uid);
    await supabase.rpc("adjust_comments_counter", {
      p_id: cid,
      p_col: "likes",
      p_delta: -1,
    });
    unliked = true;
  } else {
    await supabase
      .from("comment_likes")
      .insert({ comment_id: cid, ip_address: ip, firebase_uid: user.uid });
    await supabase.rpc("adjust_comments_counter", {
      p_id: cid,
      p_col: "likes",
      p_delta: 1,
    });
  }

  const { data: comment } = await supabase
    .from("comments")
    .select("likes")
    .eq("id", cid)
    .maybeSingle();

  return NextResponse.json({ unliked, likes: comment?.likes ?? 0 });
}
