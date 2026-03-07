export const dynamic = "force-dynamic";

import { sql } from "@/app/lib/db";
import { NextRequest, NextResponse } from "next/server";

// GET /api/posts/my?author=닉네임
export async function GET(req: NextRequest) {
  const author = req.nextUrl.searchParams.get("author")?.trim();
  if (!author) {
    return NextResponse.json({ posts: [] });
  }

  const rows = await sql`
    SELECT p.id, p.category_id, p.title, p.content, p.author, p.region, p.tags,
           p.likes, p.comments_count, p.is_notice, p.views, p.created_at, p.updated_at,
           c.name as category_name
    FROM posts p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.author = ${author}
    ORDER BY p.created_at DESC
    LIMIT 50
  `;

  return NextResponse.json({ posts: rows });
}
