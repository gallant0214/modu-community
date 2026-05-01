import { supabase } from "@/app/lib/supabase";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { sendPushToUser } from "@/app/lib/notifications";
import { waitUntil } from "@vercel/functions";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인을 해주세요" }, { status: 401 });
  }

  const { postId } = await params;
  const id = Number(postId);

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

  const { data: existing } = await supabase
    .from("post_likes")
    .select("id")
    .eq("post_id", id)
    .eq("firebase_uid", user.uid)
    .maybeSingle();

  let unliked = false;

  if (existing) {
    await supabase
      .from("post_likes")
      .delete()
      .eq("post_id", id)
      .eq("firebase_uid", user.uid);
    await supabase.rpc("adjust_post_counter", {
      p_id: id,
      p_col: "likes",
      p_delta: -1,
    });
    unliked = true;
  } else {
    await supabase
      .from("post_likes")
      .insert({ post_id: id, ip_address: ip, firebase_uid: user.uid });
    await supabase.rpc("adjust_post_counter", {
      p_id: id,
      p_col: "likes",
      p_delta: 1,
    });
  }

  const { data: post } = await supabase
    .from("posts")
    .select("likes, firebase_uid, title")
    .eq("id", id)
    .maybeSingle();

  const newLikes = post?.likes ?? 0;

  // 좋아요 알림 (누적 카운팅) — 좋아요를 누른 경우만
  if (!unliked && post?.firebase_uid && post.firebase_uid !== user.uid) {
    try {
      const postOwnerUid = post.firebase_uid;
      const postTitle = (post.title || "").substring(0, 30);

      const { data: prefs } = await supabase
        .from("notification_preferences")
        .select("notify_like")
        .eq("firebase_uid", postOwnerUid)
        .maybeSingle();

      if (prefs && prefs.notify_like === false) {
        // 알림 OFF
      } else {
        // notification_logs 단순 INSERT (원본 raw SQL의 dedup 로직은 read 컬럼/jsonb data 부재로 실제 동작 안 했음)
        await supabase.from("notification_logs").insert({
          firebase_uid: postOwnerUid,
          type: "post_like",
          title: `"${postTitle}" 글에 좋아요 ${newLikes}개`,
          body: `회원님의 글에 좋아요가 ${newLikes}개 달렸습니다`,
          data: JSON.stringify({ postId: String(id) }),
          like_count: newLikes,
        });

        waitUntil(
          sendPushToUser(
            postOwnerUid,
            "like",
            `"${postTitle}" 글에 좋아요`,
            `회원님의 글에 좋아요가 ${newLikes}개 달렸습니다`,
            { postId: String(id), type: "post_like" },
          ).catch(() => {}),
        );
      }
    } catch {}
  }

  return NextResponse.json({ unliked, likes: newLikes });
}
