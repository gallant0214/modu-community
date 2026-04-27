import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 알림 읽음 처리
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { id, all } = await request.json();

  if (all) {
    const { error } = await supabase
      .from("notification_logs")
      .update({ read: true })
      .eq("firebase_uid", user.uid)
      .eq("read", false);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (id) {
    const { error } = await supabase
      .from("notification_logs")
      .update({ read: true })
      .eq("id", Number(id))
      .eq("firebase_uid", user.uid);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
