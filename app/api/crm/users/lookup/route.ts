import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { getFirebaseAdmin } from "@/app/lib/firebase-admin";
import { getAuth } from "firebase-admin/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/users/lookup?q=<이메일 또는 전화번호>
 *
 * 회원 등록에서 "모두의 지도사 커뮤니티 회원" 검색용. owner/admin 만 진입.
 *
 * - '@' 포함 → 이메일 정확 매칭 (Firebase Auth getUserByEmail)
 * - 숫자 위주 → 전화번호 정확 매칭 (Firebase Auth getUserByPhoneNumber, E.164)
 *   ※ 커뮤니티 계정에 전화번호가 등록된 경우에만 조회됨.
 * 닉네임 검색은 사용하지 않음 (요청: 이메일·전화번호로만).
 */
async function nicknameFor(uid: string): Promise<string | null> {
  const { data } = await supabase
    .from("nicknames")
    .select("name")
    .eq("firebase_uid", uid)
    .maybeSingle();
  return data?.name ?? null;
}

export async function GET(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ users: [] });

  const auth = getAuth(getFirebaseAdmin());

  // ── 이메일 정확 매칭 ──────────────────────────────────────────────
  if (q.includes("@")) {
    try {
      const fbUser = await auth.getUserByEmail(q);
      const name = await nicknameFor(fbUser.uid);
      return NextResponse.json({
        users: name ? [{ firebase_uid: fbUser.uid, name, email: fbUser.email ?? null }] : [],
      });
    } catch {
      return NextResponse.json({ users: [] });
    }
  }

  // ── 전화번호 정확 매칭 (E.164 변환) ───────────────────────────────
  const digits = q.replace(/[^0-9]/g, "");
  if (digits.length >= 9) {
    let e164: string | null = null;
    if (digits.startsWith("0")) e164 = `+82${digits.slice(1)}`;
    else if (digits.startsWith("82")) e164 = `+${digits}`;
    else e164 = `+82${digits}`;
    try {
      const fbUser = await auth.getUserByPhoneNumber(e164);
      const name = await nicknameFor(fbUser.uid);
      return NextResponse.json({
        users: name ? [{ firebase_uid: fbUser.uid, name, email: fbUser.email ?? null }] : [],
      });
    } catch {
      return NextResponse.json({ users: [] });
    }
  }

  return NextResponse.json({ users: [] });
}
