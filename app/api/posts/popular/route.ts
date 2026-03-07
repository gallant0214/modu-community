import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 3, 10);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const posts = await sql`
    SELECT p.*, c.name AS category_name
    FROM posts p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE (p.is_notice = false OR p.is_notice IS NULL)
      AND p.created_at >= ${monthStart}
      AND p.likes > 0
    ORDER BY p.likes DESC, p.created_at DESC
    LIMIT ${limit}
  `;

  return NextResponse.json(posts);
}
