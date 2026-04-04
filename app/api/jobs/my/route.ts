export const dynamic = "force-dynamic";

import { sql } from "@/app/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

// GET /api/jobs/my — 내가 등록한 구인글 (firebase_uid 기반, IP 연결 없음)
export async function GET(req: NextRequest) {
  const user = await verifyAuth(req);
  if (!user) {
    return NextResponse.json({ posts: [], error: "로그인이 필요합니다" }, { status: 401 });
  }

  const rows = await sql`
    SELECT id, title, description, center_name, address,
           author_role, author_name, contact_type, contact,
           sport, region_name, region_code,
           employment_type, salary, headcount,
           benefits, preferences, deadline,
           likes, views, is_closed, created_at, updated_at
    FROM job_posts
    WHERE firebase_uid = ${user.uid}
    ORDER BY created_at DESC
    LIMIT 50
  `;

  return NextResponse.json({ posts: rows });
}
