import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { getFirebaseAdmin } from "@/app/lib/firebase-admin";
import { getAuth } from "firebase-admin/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/users/lookup?q=<닉네임 또는 이메일>
 *
 * 회원 등록·직원 추가에서 사용자 검색용. owner/admin 만 진입.
 *
 * 쿼리에 '@' 가 있으면 이메일 정확 매칭 시도 (Firebase Auth getUserByEmail).
 * 그 외엔 nicknames 테이블에서 이름 부분 매칭 (ilike).
 *
 * 결과에 이메일을 함께 반환 (Firebase Auth getUsers 배치 조회).
 */
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
      const { data: nick } = await supabase
        .from("nicknames")
        .select("name")
        .eq("firebase_uid", fbUser.uid)
        .maybeSingle();
      return NextResponse.json({
        users: nick
          ? [{ firebase_uid: fbUser.uid, name: nick.name, email: fbUser.email ?? null }]
          : [],
      });
    } catch {
      // 사용자 없음 또는 형식 오류
      return NextResponse.json({ users: [] });
    }
  }

  // ── 닉네임 부분 매칭 ──────────────────────────────────────────────
  const { data: rows, error } = await supabase
    .from("nicknames")
    .select("firebase_uid, name")
    .ilike("name", `%${q}%`)
    .not("firebase_uid", "is", null)
    .order("name", { ascending: true })
    .limit(15);

  if (error) {
    return NextResponse.json({ error: "검색 실패", detail: error.message }, { status: 500 });
  }

  const uids = (rows ?? [])
    .map((r) => r.firebase_uid)
    .filter((u): u is string => !!u);

  // Firebase Auth 에서 이메일 일괄 조회 (최대 100명)
  const emailMap = new Map<string, string>();
  if (uids.length > 0) {
    try {
      const result = await auth.getUsers(uids.map((uid) => ({ uid })));
      for (const u of result.users) {
        if (u.email) emailMap.set(u.uid, u.email);
      }
    } catch {
      // 이메일 조회 실패해도 닉네임만 반환
    }
  }

  return NextResponse.json({
    users: (rows ?? [])
      .filter((r): r is { firebase_uid: string; name: string } => !!r.firebase_uid)
      .map((r) => ({
        firebase_uid: r.firebase_uid,
        name: r.name,
        email: emailMap.get(r.firebase_uid) ?? null,
      })),
  });
}
