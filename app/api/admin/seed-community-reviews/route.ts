import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { verifyAdminPassword } from "@/app/lib/admin-auth";
import { invalidateCache } from "@/app/lib/cache";
import { revalidatePath } from "next/cache";
import { newPosts, pickRegion } from "./data";

async function flushCommunityCache(categoryIds: number[]) {
  await invalidateCache("posts:*").catch(() => {});
  await invalidateCache("categories:*").catch(() => {});
  revalidatePath("/");
  revalidatePath("/community");
  for (const id of categoryIds) revalidatePath(`/category/${id}`);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const password = body?.password as string | undefined;
  const cacheOnly = body?.cacheOnly === true;

  if (!password || !(await verifyAdminPassword(password))) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  const allCategoryIds = Array.from(new Set(newPosts.map((p) => p.categoryId)));

  if (cacheOnly) {
    await flushCommunityCache(allCategoryIds);
    return NextResponse.json({ success: true, cacheOnly: true });
  }

  let postsInserted = 0;
  let commentsInserted = 0;

  for (const post of newPosts) {
    const region = pickRegion();
    const views = Math.floor(Math.random() * 81) + 20;
    const { data: inserted, error: pErr } = await supabase
      .from("posts")
      .insert({
        category_id: post.categoryId,
        title: post.title,
        content: post.content,
        author: post.author,
        password: "__seed_community__",
        ip_address: "seed_community",
        region,
        tags: "기타",
        views,
        created_at: post.date,
      })
      .select("id")
      .single();

    if (pErr || !inserted) {
      console.error("post insert fail:", post.title, pErr);
      continue;
    }
    postsInserted++;
    const postId = inserted.id;

    for (const c of post.comments) {
      const commentDate = new Date(post.date);
      commentDate.setHours(commentDate.getHours() + c.hoursOffset);
      const { error: cErr } = await supabase.from("comments").insert({
        post_id: postId,
        author: c.author,
        content: c.content,
        password: "__seed_community__",
        ip_address: "seed_community",
        created_at: commentDate.toISOString(),
      });
      if (!cErr) commentsInserted++;
    }

    // comments_count 갱신
    const { count } = await supabase
      .from("comments")
      .select("*", { count: "exact", head: true })
      .eq("post_id", postId);
    if (count !== null) {
      await supabase.from("posts").update({ comments_count: count }).eq("id", postId);
    }
  }

  await flushCommunityCache(allCategoryIds);
  return NextResponse.json({ success: true, postsInserted, commentsInserted });
}
