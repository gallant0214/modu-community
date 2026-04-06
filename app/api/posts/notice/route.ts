import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/posts/notice — 공지 게시글 1개 (is_notice = true, 가장 최근)
export async function GET() {
  try {
    const rows = await sql`
      SELECT p.*, c.name AS category_name
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.is_notice = true
      ORDER BY p.created_at DESC
      LIMIT 1
    `;
    if (rows.length === 0) {
      return NextResponse.json(null);
    }
    return NextResponse.json(rows[0]);
  } catch {
    return NextResponse.json(null);
  }
}
