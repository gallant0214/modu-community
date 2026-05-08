import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "@/app/lib/supabase";
import { invalidateCache } from "@/app/lib/cache";
import { verifyAdminPassword } from "@/app/lib/admin-auth";
import { newPosts, MIXED_POOL } from "./data";

async function flushCommunityCache(categoryIds: number[]) {
  await invalidateCache("posts:*").catch(() => {});
  await invalidateCache("categories:*").catch(() => {});
  revalidatePath("/");
  revalidatePath("/community");
  for (const id of categoryIds) revalidatePath(`/category/${id}`);
}

function pickRegion(): string {
  const regions: Array<{ region: string; w: number }> = [
    { region: "서울", w: 5 },
    { region: "경기", w: 6 },
    { region: "부산", w: 3 },
    { region: "인천", w: 3 },
    { region: "대구", w: 2 },
    { region: "대전", w: 2 },
    { region: "광주", w: 2 },
    { region: "울산", w: 1 },
    { region: "충남", w: 1 },
    { region: "충북", w: 1 },
    { region: "전북", w: 1 },
    { region: "전남", w: 1 },
    { region: "경북", w: 1 },
    { region: "경남", w: 2 },
    { region: "강원", w: 1 },
    { region: "제주", w: 1 },
    { region: "세종", w: 1 },
  ];
  const total = regions.reduce((sum, r) => sum + r.w, 0);
  let r = Math.random() * total;
  for (const region of regions) {
    r -= region.w;
    if (r <= 0) return region.region;
  }
  return "서울";
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password, cacheOnly } = body;

    if (!(await verifyAdminPassword(password))) {
      return NextResponse.json({ success: false, error: "Invalid password" }, { status: 401 });
    }

    // === 사전 검증 (체크리스트 5가지) ===
    // 1. 중복 (title, content) 검증
    const seenKey = new Set<string>();
    for (const p of newPosts) {
      const key = `${p.title}|||${p.content}`;
      if (seenKey.has(key)) {
        return NextResponse.json({ success: false, error: `중복 게시글: ${p.title}` }, { status: 400 });
      }
      seenKey.add(key);
    }

    // 2. 카테고리 매핑 검증
    const SPORT_KEYWORDS: Record<number, string[]> = {
      1: ["보디빌딩", "헬스", "웨이트", "포징", "벤치", "데드", "스쿼트", "벌크업", "PT", "트레이너"],
      5: ["수영", "IM", "자유형", "배영", "평영", "접영", "사이드킥", "글라이딩", "스타트", "다이빙", "이어플러그", "물질"],
    };
    for (const p of newPosts) {
      const text = p.title + " " + p.content;
      const expectedCats = Object.entries(SPORT_KEYWORDS).filter(([, kws]) =>
        kws.some((k) => text.includes(k)),
      );
      if (expectedCats.length > 0) {
        const matchedCats = expectedCats.map(([cid]) => Number(cid));
        if (!matchedCats.includes(p.categoryId)) {
          return NextResponse.json(
            {
              success: false,
              error: `카테고리 불일치: cat=${p.categoryId}, expected=${matchedCats.join("|")}, title="${p.title}"`,
            },
            { status: 400 },
          );
        }
      }
    }

    // 3. 작성자 풀과 댓글자 풀 분리 검증
    const authorSet = new Set(newPosts.map((p) => p.author));
    for (const p of newPosts) {
      for (const c of p.comments) {
        if (authorSet.has(c.author)) {
          return NextResponse.json(
            { success: false, error: `댓글자가 작성자 풀과 겹침: ${c.author}` },
            { status: 400 },
          );
        }
      }
    }
    // MIXED_POOL과 작성자 풀 겹침 검증
    for (const author of authorSet) {
      if (MIXED_POOL.includes(author)) {
        return NextResponse.json(
          { success: false, error: `작성자가 MIXED_POOL과 겹침: ${author}` },
          { status: 400 },
        );
      }
    }

    const allCategoryIds = Array.from(new Set(newPosts.map((p) => p.categoryId)));

    if (cacheOnly) {
      await flushCommunityCache(allCategoryIds);
      return NextResponse.json({ success: true, cacheOnly: true, categoryIds: allCategoryIds });
    }

    let postsInserted = 0;
    let commentsInserted = 0;
    const errors: string[] = [];

    for (const post of newPosts) {
      try {
        const region = pickRegion();
        const views = Math.floor(Math.random() * 81) + 20;

        const { data: insertedPost, error: postErr } = await supabase
          .from("posts")
          .insert({
            title: post.title,
            content: post.content,
            category_id: post.categoryId,
            author: post.author,
            region,
            tags: "기타",
            views,
            password: "__seed_community__",
            ip_address: "seed_community",
            created_at: post.date,
            likes: 0,
            comments_count: 0,
          })
          .select("id")
          .single();

        if (postErr || !insertedPost) {
          errors.push(`post insert failed: ${post.title} - ${postErr?.message}`);
          continue;
        }

        postsInserted++;
        const postId = insertedPost.id;

        // 댓글 추가 (작성자와 다른 풀에서, 한 글 안에서 중복 X)
        const usedAuthors = new Set<string>([post.author]);
        for (const comment of post.comments) {
          if (usedAuthors.has(comment.author)) continue;
          usedAuthors.add(comment.author);

          const baseDate = new Date(post.date);
          const offsetMs = (1 + Math.floor(Math.random() * 47)) * 60 * 60 * 1000;
          const commentDate = new Date(baseDate.getTime() + offsetMs).toISOString();

          const { error: commentErr } = await supabase.from("comments").insert({
            post_id: postId,
            author: comment.author,
            password: "__seed_community__",
            content: comment.content,
            ip_address: "seed_community",
            created_at: commentDate,
            likes: 0,
          });

          if (!commentErr) commentsInserted++;
        }

        // comments_count 갱신
        const { count } = await supabase
          .from("comments")
          .select("*", { count: "exact", head: true })
          .eq("post_id", postId);

        if (count !== null) {
          await supabase.from("posts").update({ comments_count: count }).eq("id", postId);
        }
      } catch (e) {
        errors.push(`post error: ${post.title} - ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    await flushCommunityCache(allCategoryIds);

    return NextResponse.json({
      success: true,
      postsInserted,
      commentsInserted,
      categoryIds: allCategoryIds,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
