export const dynamic = "force-dynamic";

import { sql } from "@/app/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

// GET /api/comments/my — 내가 댓글 단 게시글 (firebase_uid 기반)
export async function GET(req: NextRequest) {
  const user = await verifyAuth(req);
  if (!user) {
    return NextResponse.json({ comments: [], error: "로그인이 필요합니다" }, { status: 401 });
  }

  await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS firebase_uid TEXT`;

  const rows = await sql`
    SELECT DISTINCT ON (p.id)
           p.id, p.category_id, p.title, p.content, p.author, p.region, p.tags,
           p.likes, p.comments_count, p.is_notice, p.views, p.created_at, p.updated_at,
           c.name as category_name
    FROM comments cm
    INNER JOIN posts p ON cm.post_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE cm.firebase_uid = ${user.uid}
    ORDER BY p.id, p.created_at DESC
    LIMIT 50
  `;

  rows.sort((a: { created_at: string }, b: { created_at: string }) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return NextResponse.json({ comments: rows });
}
