import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// DELETE /api/notifications/[id] — 알림 삭제 (본인 것만)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await verifyAuth(req);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const { id } = await params;
  const notiId = Number(id);
  if (!Number.isFinite(notiId)) {
    return NextResponse.json({ error: "잘못된 id" }, { status: 400 });
  }

  // 본인 알림만 삭제
  const { data: existing } = await supabase
    .from("notification_logs")
    .select("firebase_uid")
    .eq("id", notiId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "알림을 찾을 수 없습니다" }, { status: 404 });
  }
  if (existing.firebase_uid !== user.uid) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  const { error } = await supabase
    .from("notification_logs")
    .delete()
    .eq("id", notiId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
