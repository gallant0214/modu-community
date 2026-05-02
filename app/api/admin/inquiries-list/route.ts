import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

export const dynamic = "force-dynamic";

function getFirebaseAdmin() {
  if (getApps().length === 0) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccount) {
      return initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
    }
    return initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || "moducm-f2edf" });
  }
  return getApps()[0];
}

// POST /api/admin/inquiries-list — 문의 목록 + 작성자 현재 닉네임 보강
// body: { password }
// 기존 inquiries.author 가 이메일로 저장된 옛 데이터 보정 + 현재 닉네임 표시
export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({}));
  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  const { data, error } = await (supabase as any)
    .from("inquiries")
    .select("id, author, email, title, content, reply, replied_at, hidden, created_at, firebase_uid")
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const inquiries: any[] = data || [];

  const uids = Array.from(new Set(inquiries.map((i) => i.firebase_uid).filter(Boolean))) as string[];

  const nicknameMap = new Map<string, string>();
  if (uids.length > 0) {
    const { data: nickRows } = await (supabase as any)
      .from("nicknames")
      .select("firebase_uid, name")
      .in("firebase_uid", uids);
    for (const n of nickRows || []) {
      if (n.firebase_uid && n.name) nicknameMap.set(n.firebase_uid, n.name);
    }
  }

  const emailMap = new Map<string, string>();
  if (uids.length > 0) {
    try {
      const admin = getFirebaseAdmin();
      const auth = getAuth(admin);
      for (let i = 0; i < uids.length; i += 100) {
        const batch = uids.slice(i, i + 100).map((uid) => ({ uid }));
        const result = await auth.getUsers(batch);
        for (const u of result.users) {
          if (u.uid && u.email) emailMap.set(u.uid, u.email);
        }
      }
    } catch (e) {
      console.error("[admin/inquiries-list] firebase-admin getUsers failed:", e);
    }
  }

  const enriched = inquiries.map((i: any) => {
    const current_nickname = i.firebase_uid ? nicknameMap.get(i.firebase_uid) || null : null;
    const current_email = i.firebase_uid ? emailMap.get(i.firebase_uid) || null : null;
    return {
      ...i,
      current_nickname,
      current_email,
    };
  });

  return NextResponse.json({ inquiries: enriched });
}
