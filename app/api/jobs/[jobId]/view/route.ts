import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { invalidateCache } from "@/app/lib/cache";
import { waitUntil } from "@vercel/functions";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const { error } = await supabase.rpc("adjust_job_post_counter", {
    p_id: Number(jobId),
    p_col: "views",
    p_delta: 1,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // 최신 구인 리스트는 60초 캐시 — view 증가 후 즉시 반영을 위해 무효화.
  // waitUntil 로 응답 후 백그라운드에서 보장 (serverless 종료 회피).
  waitUntil(invalidateCache("jobs:latest:*"));
  return NextResponse.json({ success: true });
}
