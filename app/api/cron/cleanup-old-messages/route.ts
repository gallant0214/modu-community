export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { supabase } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

/**
 * 미읽음 쪽지 30일 경과 자동 정리.
 * 하루 1회 실행 (vercel.json crons).
 *
 * 정책:
 * - is_read = false 이고 created_at < now - 30 days 인 쪽지를
 *   deleted_by_receiver = true 로 soft delete (수신자 받은쪽지함에서 사라짐).
 * - 발신자 보낸쪽지함에는 그대로 유지 (deleted_by_sender 는 건드리지 않음).
 *
 * Vercel Cron 보안: Vercel 이 자동으로 추가하는 x-vercel-cron 헤더 또는
 * CRON_SECRET 환경변수로 호출자 검증.
 */
export async function GET(req: NextRequest) {
  // 호출자 검증 — Vercel cron 또는 명시적 시크릿 헤더
  const isVercelCron = req.headers.get("x-vercel-cron") !== null;
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const hasValidSecret = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isVercelCron && !hasValidSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // 후보 조회 (개수 확인용)
  const { count: candidateCount } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false)
    .eq("deleted_by_receiver", false)
    .lt("created_at", cutoff);

  if (!candidateCount || candidateCount === 0) {
    return NextResponse.json({ success: true, deleted: 0, cutoff });
  }

  // soft delete
  const { error } = await supabase
    .from("messages")
    .update({
      deleted_by_receiver: true,
      deleted_by_receiver_at: new Date().toISOString(),
    })
    .eq("is_read", false)
    .eq("deleted_by_receiver", false)
    .lt("created_at", cutoff);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, deleted: candidateCount, cutoff });
}
