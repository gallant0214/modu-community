import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// FCM 토큰 등록/업데이트
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { token, platform } = await request.json();
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });

  const { error } = await supabase.from("device_tokens").upsert(
    {
      firebase_uid: user.uid,
      token,
      platform: platform || "ios",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "firebase_uid,token" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// FCM 토큰 삭제 (로그아웃 시)
export async function DELETE(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { token } = await request.json();
  let query = supabase.from("device_tokens").delete().eq("firebase_uid", user.uid);
  if (token) query = query.eq("token", token);
  const { error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
