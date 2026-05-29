// 38차 보충 시드 라우트 — 보디빌딩 카톡 5/20~5/29 추가 토픽
// 사용 후 디렉토리째 제거 예정. 운영자 비번 검증 + cacheOnly 옵션 포함.

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "@/app/lib/supabase";
import { invalidateCache } from "@/app/lib/cache";
import { verifyAdminPassword } from "@/app/lib/admin-auth";
import { newPosts, pickRegion } from "./data";

async function flushCommunityCache(categoryIds: number[]) {
  await invalidateCache("posts:*").catch(() => {});
  await invalidateCache("categories:*").catch(() => {});
  revalidatePath("/");
  revalidatePath("/community");
  for (const id of categoryIds) revalidatePath(`/category/${id}`);
}

export async function POST(request: Request) {
  let body: { password?: string; cacheOnly?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }

  const { password, cacheOnly } = body;
  if (!password || !(await verifyAdminPassword(password))) {
    return NextResponse.json(
      { error: "관리자 비밀번호가 일치하지 않습니다" },
      { status: 403 }
    );
  }

  const allCategoryIds = Array.from(new Set(newPosts.map((p) => p.categoryId)));

  if (cacheOnly) {
    await flushCommunityCache(allCategoryIds);
    return NextResponse.json({ success: true, cacheOnly: true });
  }

  let postsInserted = 0;
  let commentsInserted = 0;
  const failures: string[] = [];

  for (const post of newPosts) {
    try {
      const region = pickRegion();
      const views = Math.floor(Math.random() * 81) + 20;

      const { data: inserted, error: postErr } = await supabase
        .from("posts")
        .insert({
          title: post.title,
          content: post.content,
          author: post.author,
          category_id: post.categoryId,
          region,
          views,
          tags: "기타",
          password: "__seed_community__",
          ip_address: "seed_community",
          created_at: post.date,
          updated_at: post.date,
        })
        .select("id")
        .single();

      if (postErr || !inserted) {
        failures.push(`post insert 실패: ${post.title} — ${postErr?.message}`);
        continue;
      }

      const postId = inserted.id;
      postsInserted++;

      const baseTs = new Date(post.date).getTime();
      for (const c of post.comments) {
        const commentTs = new Date(baseTs + c.hoursAfter * 3600 * 1000).toISOString();
        const { error: cErr } = await supabase.from("comments").insert({
          post_id: postId,
          author: c.author,
          content: c.content,
          password: "__seed_community__",
          ip_address: "seed_community",
          created_at: commentTs,
          updated_at: commentTs,
        });
        if (cErr) {
          failures.push(`comment 실패 post=${postId}: ${cErr.message}`);
        } else {
          commentsInserted++;
        }
      }

      const { count } = await supabase
        .from("comments")
        .select("id", { count: "exact", head: true })
        .eq("post_id", postId);
      if (count !== null) {
        await supabase
          .from("posts")
          .update({ comments_count: count })
          .eq("id", postId);
      }
    } catch (e) {
      failures.push(`예외 ${post.title}: ${(e as Error).message}`);
    }
  }

  await flushCommunityCache(allCategoryIds);

  return NextResponse.json({
    success: true,
    postsInserted,
    commentsInserted,
    failures,
  });
}
