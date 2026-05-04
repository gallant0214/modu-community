export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { supabase } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

/**
 * 쪽지 자동 정리 cron — 하루 1회 실행 (vercel.json crons).
 *
 * 정책 1: 미읽음 쪽지 30일 경과 → 받은쪽지함에서 soft delete
 *   - is_read = false AND created_at < now - 30 days
 *   - deleted_by_receiver = true 로 마크 (발신자 보낸함은 그대로 유지)
 *
 * 정책 2: 스팸쪽지함의 쪽지 15일 경과 → 받은쪽지 측 soft delete
 *   - spam_reported_by_receiver = true AND spam_reported_at < now - 15 days
 *   - deleted_by_receiver = true 로 마크 (발신자 보낸함은 그대로 유지)
 *
 * 보안: Vercel x-vercel-cron 헤더 또는 CRON_SECRET 검증.
 */
export async function GET(req: NextRequest) {
  const isVercelCron = req.headers.get("x-vercel-cron") !== null;
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const hasValidSecret = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isVercelCron && !hasValidSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const cutoff30 = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff15 = new Date(now - 15 * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  // 정책 1: 미읽음 30일 경과 정리
  const { count: unreadCount } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false)
    .eq("deleted_by_receiver", false)
    .lt("created_at", cutoff30);

  let deletedUnread = 0;
  if (unreadCount && unreadCount > 0) {
    const { error } = await supabase
      .from("messages")
      .update({ deleted_by_receiver: true, deleted_by_receiver_at: nowIso })
      .eq("is_read", false)
      .eq("deleted_by_receiver", false)
      .lt("created_at", cutoff30);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    deletedUnread = unreadCount;
  }

  // 정책 2: 스팸 신고 15일 경과 정리
  const { count: spamCount } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("spam_reported_by_receiver", true)
    .eq("deleted_by_receiver", false)
    .lt("spam_reported_at", cutoff15);

  let deletedSpam = 0;
  if (spamCount && spamCount > 0) {
    const { error } = await supabase
      .from("messages")
      .update({ deleted_by_receiver: true, deleted_by_receiver_at: nowIso })
      .eq("spam_reported_by_receiver", true)
      .eq("deleted_by_receiver", false)
      .lt("spam_reported_at", cutoff15);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    deletedSpam = spamCount;
  }

  return NextResponse.json({
    success: true,
    deletedUnread,
    deletedSpam,
    cutoff30,
    cutoff15,
  });
}
