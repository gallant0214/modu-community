export const dynamic = "force-dynamic";

import { supabase } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

// GET /api/jobs/my — 내가 등록한 구인글 (firebase_uid 기반)
export async function GET(req: NextRequest) {
  const user = await verifyAuth(req);
  if (!user) {
    return NextResponse.json({ posts: [], error: "로그인이 필요합니다" }, { status: 401 });
  }

  const { data: jobs, error } = await supabase
    .from("job_posts")
    .select(
      "id, title, description, center_name, address, author_role, author_name, contact_type, contact, sport, region_name, region_code, employment_type, salary, headcount, benefits, preferences, deadline, likes, views, is_closed, share_count, created_at, updated_at",
    )
    .eq("firebase_uid", user.uid)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json({ posts: [], error: error.message }, { status: 500 });
  }

  const jobIds = jobs.map((j) => j.id);
  const counts = new Map<number, number>();
  if (jobIds.length > 0) {
    const { data: bookmarks } = await supabase
      .from("job_post_bookmarks")
      .select("job_post_id")
      .in("job_post_id", jobIds)
      .limit(100000);
    if (bookmarks) {
      for (const b of bookmarks) {
        counts.set(b.job_post_id, (counts.get(b.job_post_id) || 0) + 1);
      }
    }
  }

  const result = jobs.map((j) => ({
    ...j,
    bookmark_count: counts.get(j.id) || 0,
  }));

  return NextResponse.json({ posts: result });
}
