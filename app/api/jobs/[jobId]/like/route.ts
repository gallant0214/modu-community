import { supabase } from "@/app/lib/supabase";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { invalidateCache } from "@/app/lib/cache";
import { waitUntil } from "@vercel/functions";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const id = Number(jobId);
  const user = await verifyAuth(request);

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

  let unliked = false;

  if (user) {
    const { data: existing } = await supabase
      .from("job_post_likes")
      .select("id")
      .eq("job_post_id", id)
      .eq("firebase_uid", user.uid)
      .maybeSingle();
    if (existing) {
      await supabase
        .from("job_post_likes")
        .delete()
        .eq("job_post_id", id)
        .eq("firebase_uid", user.uid);
      await supabase.rpc("adjust_job_post_counter", {
        p_id: id,
        p_col: "likes",
        p_delta: -1,
      });
      unliked = true;
    } else {
      await supabase
        .from("job_post_likes")
        .insert({ job_post_id: id, ip_address: ip, firebase_uid: user.uid });
      await supabase.rpc("adjust_job_post_counter", {
        p_id: id,
        p_col: "likes",
        p_delta: 1,
      });
    }
  } else {
    const { data: existing } = await supabase
      .from("job_post_likes")
      .select("id")
      .eq("job_post_id", id)
      .eq("ip_address", ip)
      .is("firebase_uid", null)
      .maybeSingle();
    if (existing) {
      await supabase
        .from("job_post_likes")
        .delete()
        .eq("job_post_id", id)
        .eq("ip_address", ip)
        .is("firebase_uid", null);
      await supabase.rpc("adjust_job_post_counter", {
        p_id: id,
        p_col: "likes",
        p_delta: -1,
      });
      unliked = true;
    } else {
      await supabase
        .from("job_post_likes")
        .insert({ job_post_id: id, ip_address: ip });
      await supabase.rpc("adjust_job_post_counter", {
        p_id: id,
        p_col: "likes",
        p_delta: 1,
      });
    }
  }

  const { data: job } = await supabase
    .from("job_posts")
    .select("likes")
    .eq("id", id)
    .maybeSingle();

  // 최신 구인 리스트 캐시 무효화 — 좋아요 수 즉시 반영
  waitUntil(invalidateCache("jobs:latest:*"));

  return NextResponse.json({ unliked, likes: job?.likes ?? 0 });
}
