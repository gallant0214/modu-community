import { supabase } from "@/app/lib/supabase";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

// POST /api/jobs/[jobId]/bookmark — 북마크 토글
export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const id = Number(jobId);

  const user = await verifyAuth(request);
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

  let unbookmarked = false;

  if (user) {
    const { data: existing } = await supabase
      .from("job_post_bookmarks")
      .select("id")
      .eq("job_post_id", id)
      .eq("firebase_uid", user.uid)
      .maybeSingle();
    if (existing) {
      await supabase
        .from("job_post_bookmarks")
        .delete()
        .eq("job_post_id", id)
        .eq("firebase_uid", user.uid);
      unbookmarked = true;
    } else {
      await supabase
        .from("job_post_bookmarks")
        .insert({ job_post_id: id, ip_address: ip, firebase_uid: user.uid });
    }
  } else {
    const { data: existing } = await supabase
      .from("job_post_bookmarks")
      .select("id")
      .eq("job_post_id", id)
      .eq("ip_address", ip)
      .is("firebase_uid", null)
      .maybeSingle();
    if (existing) {
      await supabase
        .from("job_post_bookmarks")
        .delete()
        .eq("job_post_id", id)
        .eq("ip_address", ip)
        .is("firebase_uid", null);
      unbookmarked = true;
    } else {
      await supabase
        .from("job_post_bookmarks")
        .insert({ job_post_id: id, ip_address: ip });
    }
  }

  const { count } = await supabase
    .from("job_post_bookmarks")
    .select("*", { count: "exact", head: true })
    .eq("job_post_id", id);

  return NextResponse.json({ unbookmarked, bookmark_count: count ?? 0 });
}

// GET /api/jobs/[jobId]/bookmark — 북마크 상태 조회
export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const id = Number(jobId);

  try {
    const user = await verifyAuth(request);
    const { count } = await supabase
      .from("job_post_bookmarks")
      .select("*", { count: "exact", head: true })
      .eq("job_post_id", id);

    let bookmarked = false;
    if (user) {
      const { data } = await supabase
        .from("job_post_bookmarks")
        .select("id")
        .eq("job_post_id", id)
        .eq("firebase_uid", user.uid)
        .maybeSingle();
      bookmarked = !!data;
    }

    return NextResponse.json({ bookmark_count: count ?? 0, bookmarked });
  } catch {
    return NextResponse.json({ bookmark_count: 0, bookmarked: false });
  }
}
