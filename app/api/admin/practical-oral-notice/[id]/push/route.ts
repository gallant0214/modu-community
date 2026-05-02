import { supabase } from "@/app/lib/supabase";
import { sendPushToUser } from "@/app/lib/notifications";
import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

// POST { password, customMessage? }
// 공지 수정 후 등록 이용자 전체에게 푸시 발송 (notice 유형)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { password, customMessage } = body;

  if (!(await verifyAdminPassword(password || ""))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  const { data: notice, error: noticeErr } = await supabase
    .from("practical_oral_notices")
    .select("id, audience, slug, title, summary")
    .eq("id", Number(id))
    .maybeSingle();
  if (noticeErr) return NextResponse.json({ error: noticeErr.message }, { status: 500 });
  if (!notice) return NextResponse.json({ error: "공지를 찾을 수 없습니다" }, { status: 404 });

  const pushTitle = "📢 실기·구술 공지 업데이트";
  const pushBody = customMessage?.trim() || `${notice.title} — 내용이 업데이트되었습니다`;
  const linkUrl = `moducm://practical/notice/${notice.audience}/${notice.slug}`;

  // 푸시 대상: 디바이스 토큰 등록된 모든 사용자 중 notice 알림 ON
  const { data: tokens } = await supabase
    .from("device_tokens")
    .select("firebase_uid")
    .limit(100000);
  const uniqueUids = [...new Set((tokens || []).map((t) => t.firebase_uid))];

  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("firebase_uid, notify_notice")
    .in("firebase_uid", uniqueUids);
  const prefMap = new Map((prefs || []).map((p) => [p.firebase_uid, p]));

  const targetUids = uniqueUids.filter((uid) => {
    const p = prefMap.get(uid);
    return p?.notify_notice !== false;
  });

  let sentCount = 0;
  let failCount = 0;
  for (const uid of targetUids) {
    try {
      await sendPushToUser(uid, "notice", pushTitle, pushBody, {
        type: "practical_oral_notice_update",
        notice_id: String(notice.id),
        slug: notice.slug,
        audience: notice.audience,
        link_url: linkUrl,
      });
      sentCount++;
    } catch {
      failCount++;
    }
  }

  return NextResponse.json({
    success: true,
    sentCount,
    failCount,
    totalTargets: targetUids.length,
  });
}
