import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

const CURRENT_TERMS_VERSION = "2026-05-08";

// POST /api/users/agree-terms — 약관/개인정보처리방침 동의 기록
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const now = new Date().toISOString();
  // 기존 row 가 있으면 UPDATE, 없으면 INSERT (name 은 NOT NULL 이므로 임시 placeholder)
  const { data: existing } = await (supabase as any)
    .from("nicknames")
    .select("id")
    .eq("firebase_uid", user.uid)
    .maybeSingle();

  let error: { message: string } | null = null;
  if (existing) {
    const r = await (supabase as any)
      .from("nicknames")
      .update({
        terms_agreed_at: now,
        privacy_agreed_at: now,
        terms_version: CURRENT_TERMS_VERSION,
      })
      .eq("firebase_uid", user.uid);
    error = r.error;
  } else {
    // 닉네임 미설정 상태 — 임시 placeholder name 으로 row 만들고 약관만 채움.
    // 이후 닉네임 설정 시 nicknames POST 가 같은 row 의 name 을 갱신.
    const placeholder = `__pending_${user.uid.slice(0, 8)}_${Date.now()}`;
    const r = await (supabase as any)
      .from("nicknames")
      .insert({
        firebase_uid: user.uid,
        name: placeholder,
        terms_agreed_at: now,
        privacy_agreed_at: now,
        terms_version: CURRENT_TERMS_VERSION,
      });
    error = r.error;
  }

  if (error) {
    console.error("agree-terms error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, terms_agreed_at: now, privacy_agreed_at: now, terms_version: CURRENT_TERMS_VERSION });
}
