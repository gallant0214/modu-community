import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const categories = await sql`
    SELECT c.*, COALESCE(p.cnt, 0) AS post_count
    FROM categories c
    LEFT JOIN (SELECT category_id, COUNT(*) AS cnt FROM posts WHERE is_notice = false OR is_notice IS NULL GROUP BY category_id) p
    ON c.id = p.category_id
    ORDER BY post_count DESC, c.name ASC
  `;
  return NextResponse.json(categories);
}
