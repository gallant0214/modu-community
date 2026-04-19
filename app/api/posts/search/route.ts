export const dynamic = "force-dynamic";

import { sql } from "@/app/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ posts: [] });
  }

  const like = `%${q}%`;
  const perPage = 20;

  const posts = await sql`
    SELECT p.*, c.name AS category_name, c.emoji AS category_emoji
    FROM posts p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE (p.is_notice = false OR p.is_notice IS NULL)
      AND (p.title ILIKE ${like} OR p.content ILIKE ${like} OR p.region ILIKE ${like})
    ORDER BY p.created_at DESC
    LIMIT ${perPage}
  `;

  return NextResponse.json({ posts });
}
