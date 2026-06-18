import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/lockers/unassigned-members?q=
 *
 * 락커가 배정되어 있지 않은 회원 목록.
 * 가입일·최근 수강권(구매 상품)·결제 일시 함께 반환.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();

  // 현재 배정 중인 회원 id 모음
  const { data: assigned } = await supabase
    .from("crm_lockers")
    .select("assigned_member_id")
    .eq("center_id", ctx.centerId)
    .eq("state", "assigned")
    .not("assigned_member_id", "is", null);
  const assignedIds = Array.from(
    new Set((assigned ?? []).map((a) => a.assigned_member_id).filter((v): v is number => !!v))
  );

  let query = supabase
    .from("crm_members")
    .select(
      "id, name, phone, birth, gender, member_type, created_at, linked_firebase_uid"
    )
    .eq("center_id", ctx.centerId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (assignedIds.length > 0) {
    query = query.not("id", "in", `(${assignedIds.join(",")})`);
  }
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
      return {
        ...m,
        last_pass: lp
          ? { lesson_kind: lp.lesson_kind, issued_at: lp.issued_at, paid_at: lp.created_at }
          : null,
      };
    }),
  });
}
