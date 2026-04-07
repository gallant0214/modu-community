import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * 초성 문자를 해당 한글 음절 범위 정규식으로 변환
 * ㄱ → [가-깋], ㄴ → [나-닣], ...
 */
function choToRegex(query: string): string | null {
  const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
  const hasCho = [...query].some((ch) => CHO.includes(ch));
  if (!hasCho) return null;

  let regex = "";
  for (const ch of query) {
    const idx = CHO.indexOf(ch);
    if (idx >= 0) {
      const start = String.fromCharCode(0xac00 + idx * 588);
      const end = String.fromCharCode(0xac00 + idx * 588 + 587);
      regex += `[${start}-${end}]`;
    } else {
      regex += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return regex;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 50);

  if (!q) {
    return NextResponse.json({ posts: [], jobs: [] });
  }

  const choRegex = choToRegex(q);

  let posts;
  let jobs;

  if (choRegex) {
    // 초성 검색: PostgreSQL ~ 연산자 사용
    posts = await sql`
      SELECT p.*, c.name AS category_name
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE (p.is_notice = false OR p.is_notice IS NULL)
        AND (p.title ~ ${choRegex} OR p.content ~ ${choRegex} OR p.author ~ ${choRegex} OR p.region ~ ${choRegex})
      ORDER BY p.created_at DESC
      LIMIT ${limit}
    `;

    jobs = await sql`
      SELECT *
      FROM job_posts
      WHERE (title ~ ${choRegex} OR description ~ ${choRegex} OR center_name ~ ${choRegex} OR sport ~ ${choRegex} OR region_name ~ ${choRegex})
        AND (deleted_at IS NULL)
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  } else {
    // 일반 검색: ILIKE
    const pattern = `%${q}%`;
    posts = await sql`
      SELECT p.*, c.name AS category_name
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE (p.is_notice = false OR p.is_notice IS NULL)
        AND (p.title ILIKE ${pattern} OR p.content ILIKE ${pattern} OR p.author ILIKE ${pattern} OR p.region ILIKE ${pattern})
      ORDER BY p.created_at DESC
      LIMIT ${limit}
    `;

    jobs = await sql`
      SELECT *
      FROM job_posts
      WHERE (title ILIKE ${pattern} OR description ILIKE ${pattern} OR center_name ILIKE ${pattern} OR sport ILIKE ${pattern} OR region_name ILIKE ${pattern})
        AND (deleted_at IS NULL)
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }

  return NextResponse.json({ posts, jobs });
}
