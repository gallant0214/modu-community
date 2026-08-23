import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { getFirebaseAdmin } from "@/app/lib/firebase-admin";
import { getAuth } from "firebase-admin/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/staff/lookup?q=<닉네임 또는 이메일>
 * 직원 추가용 사용자 검색. owner/admin 만.
 *
 * 동작:
 *  - q 에 '@' 포함 → Firebase Auth getUserByEmail 정확 매칭
 *  - 그 외엔 nicknames 테이블 닉네임 부분 매칭 (ilike)
 *  - 결과에 이메일 함께 반환 + 본인 센터 가입(active/inactive) 여부
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "staff.manage"))) {
    return NextResponse.json({ error: "직원 관리 권한이 없습니다" }, { status: 403 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (q.length < 1) return NextResponse.json({ users: [] });

  const auth = getAuth(getFirebaseAdmin());

  let candidates: { firebase_uid: string; name: string; email: string | null }[] = [];

  // ── 이메일 정확 매칭 ──
  if (q.includes("@")) {
    try {
      const fbUser = await auth.getUserByEmail(q);
      const { data: nick } = await supabase
        .from("nicknames")
        .select("name")
        .eq("firebase_uid", fbUser.uid)
        .maybeSingle();
      if (nick) {
        candidates = [
          { firebase_uid: fbUser.uid, name: nick.name, email: fbUser.email ?? null },
        ];
      }
    } catch {
      // not found
    }
  } else {
    // ── 닉네임 부분 매칭 ──
    const { data: rows, error } = await supabase
      .from("nicknames")
      .select("firebase_uid, name")
      .ilike("name", `%${q}%`)
      .not("firebase_uid", "is", null)
      .order("name", { ascending: true })
      .limit(20);

    if (error) {
      return NextResponse.json(
        { error: "검색 실패", detail: error.message },
        { status: 500 }
      );
    }

    const uids = (rows ?? [])
      .map((r) => r.firebase_uid)
      .filter((u): u is string => !!u);

    const emailMap = new Map<string, string>();
    if (uids.length > 0) {
      try {
        const result = await auth.getUsers(uids.map((uid) => ({ uid })));
        for (const u of result.users) {
          if (u.email) emailMap.set(u.uid, u.email);
        }
      } catch {
        // 이메일 조회 실패해도 계속
      }
    }

    candidates = (rows ?? [])
      .filter((r): r is { firebase_uid: string; name: string } => !!r.firebase_uid)
      .map((r) => ({
        firebase_uid: r.firebase_uid,
        name: r.name,
        email: emailMap.get(r.firebase_uid) ?? null,
      }));
  }

  // 본인 센터 기존 가입 여부
  const uids = candidates.map((c) => c.firebase_uid);
  const { data: existing } = uids.length
    ? await supabase
        .from("crm_center_members")
        .select("firebase_uid, status, role")
        .eq("center_id", ctx.centerId)
        .in("firebase_uid", uids)
    : { data: [] };
  const existMap = new Map(
    (existing ?? []).map((e) => [e.firebase_uid, { status: e.status, role: e.role }])
  );

  return NextResponse.json({
    users: candidates.map((c) => ({
      ...c,
      existing: existMap.get(c.firebase_uid) ?? null,
    })),
  });
}
