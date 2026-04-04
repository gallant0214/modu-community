export const dynamic = "force-dynamic";

import { sql } from "@/app/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

// GET /api/posts/my — 내가 쓴 글 (firebase_uid 기반)
export async function GET(req: NextRequest) {
  const user = await verifyAuth(req);
  if (!user) {
    return NextResponse.json({ posts: [], error: "로그인이 필요합니다" }, { status: 401 });
  }

  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS firebase_uid TEXT`;

  const rows = await sql`
    SELECT p.id, p.category_id, p.title, p.content, p.author, p.region, p.tags,
           p.likes, p.comments_count, p.is_notice, p.views, p.created_at, p.updated_at,
           c.name as category_name
    FROM posts p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.firebase_uid = ${user.uid}
    ORDER BY p.created_at DESC
    LIMIT 50
  `;

  return NextResponse.json({ posts: rows });
}
