import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/staff/lookup?q=<닉네임>
 * 직원 추가용 사용자 검색. owner/admin 만.
 *
 * - nicknames 테이블에서 닉네임 LIKE 매칭
 * - 검색 결과에 본인 센터에 이미 가입(active)된 사람 표시
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (q.length < 1) return NextResponse.json({ users: [] });

  const { data: rows, error } = await supabase
    .from("nicknames")
    .select("firebase_uid, name")
    .ilike("name", `%${q}%`)
    .not("firebase_uid", "is", null)
    .order("name", { ascending: true })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: "검색 실패", detail: error.message }, { status: 500 });
  }

  const uids = (rows ?? [])
    .map((r) => r.firebase_uid)
    .filter((u): u is string => !!u);

  // 본인 센터 이미 가입 여부
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
    users: (rows ?? [])
      .filter((r) => !!r.firebase_uid)
      .map((r) => ({
        firebase_uid: r.firebase_uid,
        name: r.name,
        existing: existMap.get(r.firebase_uid!) ?? null,
      })),
  });
}
