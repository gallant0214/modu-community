import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { lockerQuotaMap } from "@/app/lib/crm-locker-quota";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/lockers/unassigned-members?q=
 *
 * **락커 배정이 가능한 회원** 목록 — 유효한 락커 이용권 수가 현재 배정 수보다 많은 회원.
 * 가입일·최근 수강권(구매 상품)·결제 일시 함께 반환.
 *
 * 🚨 2026-10-09 변경: 예전엔 '락커가 없는 모든 활성 회원' 을 돌려줘서
 *    ① 이용권 없는 회원도 검색돼 배정됐고(락커가 이용권 없이 생김)
 *    ② 이용권 2개인 회원은 이미 1개 배정됐다는 이유로 검색에서 빠졌다.
 *    → 이용권 보유 수 기준(crm-locker-quota)으로 교체. 응답에 locker_quota 포함.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();

  // 락커 이용권 여유가 있는 회원만 대상 (이용권 수 > 배정 수)
  const quotaMap = await lockerQuotaMap(ctx.centerId);
  const eligibleIds = Array.from(quotaMap.entries())
    .filter(([, q]) => q.canAssign)
    .map(([id]) => id);
  if (eligibleIds.length === 0) {
    return NextResponse.json({ members: [] });
  }

  let query = supabase
    .from("crm_members")
    .select(
      "id, name, phone, birth, gender, member_type, created_at, linked_firebase_uid"
    )
    .eq("center_id", ctx.centerId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  query = query.in("id", eligibleIds);
  if (q) {
    query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
  }

  const { data: members, error } = await query.limit(200);
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  // 회원별 최근 수강권 (구매 상품 + 결제 일시)
  const memberIds = (members ?? []).map((m) => m.id);
  const { data: passes } = memberIds.length
    ? await supabase
        .from("crm_passes")
        .select("member_id, lesson_kind, issued_at, created_at")
        .in("member_id", memberIds)
        .neq("status", "deleted")
        .order("issued_at", { ascending: false })
    : { data: [] };

  const lastPassByMember = new Map<number, { lesson_kind: string; issued_at: string; created_at: string }>();
  for (const p of passes ?? []) {
    if (!lastPassByMember.has(p.member_id)) lastPassByMember.set(p.member_id, p);
  }

  return NextResponse.json({
    members: (members ?? []).map((m) => {
      const lp = lastPassByMember.get(m.id);
      const q = quotaMap.get(m.id);
      return {
        ...m,
        last_pass: lp
          ? { lesson_kind: lp.lesson_kind, issued_at: lp.issued_at, paid_at: lp.created_at }
          : null,
        // 락커 이용권 보유/배정 수 — 화면에서 '이용권 2개 중 1개 사용' 안내에 사용
        locker_quota: q ? { rentals: q.rentals, assigned: q.assigned } : null,
      };
    }),
  });
}
