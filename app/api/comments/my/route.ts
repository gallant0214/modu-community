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

  const rows = await sql`
    SELECT cm.id, cm.post_id, cm.content, cm.created_at,
           p.category_id, p.title as post_title,
           c.name as category_name
    FROM comments cm
    INNER JOIN posts p ON cm.post_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE cm.firebase_uid = ${user.uid}
    ORDER BY cm.created_at DESC
    LIMIT 50
  `;

  return NextResponse.json({ comments: rows });
}
