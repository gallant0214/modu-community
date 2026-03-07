export const dynamic = "force-dynamic";

import { sql } from "@/app/lib/db";
import { NextRequest, NextResponse } from "next/server";

// GET /api/jobs/my?author=닉네임
export async function GET(req: NextRequest) {
  const author = req.nextUrl.searchParams.get("author")?.trim();
  if (!author) {
    return NextResponse.json({ posts: [] });
  }

  const rows = await sql`
    SELECT id, title, description, center_name, address,
           author_role, author_name, contact_type, contact,
           sport, region_name, region_code,
           employment_type, salary, headcount,
           benefits, preferences, deadline,
           likes, views, is_closed, created_at, updated_at
    FROM job_posts
    WHERE author_name = ${author}
    ORDER BY created_at DESC
    LIMIT 50
  `;

  return NextResponse.json({ posts: rows });
}
