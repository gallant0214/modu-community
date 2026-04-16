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
    SELECT jp.id, jp.title, jp.description, jp.center_name, jp.address,
           jp.author_role, jp.author_name, jp.contact_type, jp.contact,
           jp.sport, jp.region_name, jp.region_code,
           jp.employment_type, jp.salary, jp.headcount,
           jp.benefits, jp.preferences, jp.deadline,
           jp.likes, jp.views, jp.is_closed, jp.share_count, jp.created_at, jp.updated_at,
           COALESCE((SELECT COUNT(*) FROM job_post_bookmarks jb WHERE jb.job_post_id = jp.id), 0)::int AS bookmark_count
    FROM job_posts jp
    WHERE jp.firebase_uid = ${user.uid}
    ORDER BY jp.created_at DESC
    LIMIT 50
  `;

  return NextResponse.json({ posts: rows });
}
