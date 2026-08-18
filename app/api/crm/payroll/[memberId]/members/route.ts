import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/payroll/[memberId]/members
 *
 * 강사(memberId = crm_center_members.id)의 담당 회원 목록.
 * 담당 = 주강사(trainer_member_id) 또는 추가강사(co_trainer_ids)로 연결된 수강권의 회원.
 *
 * 접근: admin 은 모든 강사, trainer 는 본인만.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { memberId } = await params;
  const trainerId = Number(memberId);
  if (!trainerId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const isAdmin = ctx.accessLevel === "admin" || ctx.role === "owner" || ctx.role === "admin";
  const isSelf = trainerId === (ctx.centerMemberId ?? -1);
  if (!isAdmin && !isSelf) {
    return NextResponse.json({ error: "본인 담당 회원만 조회할 수 있습니다" }, { status: 403 });
  }

  // 담당 수강권(주강사 또는 추가강사) — 회원 집계용
  const { data: passes, error } = await supabase
    .from("crm_passes")
    .select("member_id, lesson_kind, total_sessions, remaining_sessions, issued_at, expires_at, outstanding_won, status")
    .eq("center_id", ctx.centerId)
    .neq("status", "deleted")
    .or(`trainer_member_id.eq.${trainerId},co_trainer_ids.cs.{${trainerId}}`)
    .order("issued_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  // 회원별 집계 (최근 상품 / PT 여부 / 레슨 경험 / 수강권 미수금)
  type Agg = {
    latest_pass: string | null;
    latest_issued: string | null;
    has_pt: boolean;
    lesson_experience: boolean;
    pass_outstanding: number;
  };
  const agg = new Map<number, Agg>();
  for (const p of passes ?? []) {
    if (p.member_id == null) continue;
    const cur =
      agg.get(p.member_id) ??
      { latest_pass: null, latest_issued: null, has_pt: false, lesson_experience: false, pass_outstanding: 0 };
    // passes 는 issued_at desc 정렬 → 첫 등장이 최신
    if (cur.latest_issued == null) {
      cur.latest_pass = p.lesson_kind ?? null;
      cur.latest_issued = p.issued_at ?? null;
    }
    if ((p.total_sessions ?? 0) > 0) cur.has_pt = true;
    // 총 세션보다 잔여가 적으면 한 번 이상 수업(출석)한 것 → 개인 레슨 경험
    if ((p.total_sessions ?? 0) > 0 && (p.remaining_sessions ?? 0) < (p.total_sessions ?? 0)) {
      cur.lesson_experience = true;
    }
    cur.pass_outstanding += p.outstanding_won ?? 0;
    agg.set(p.member_id, cur);
  }

  const memberIds = Array.from(agg.keys());
  if (memberIds.length === 0) {
    return NextResponse.json({ members: [] });
  }

  const [{ data: members }, { data: mbs }] = await Promise.all([
    supabase
      .from("crm_members")
      .select(
        "id, name, phone, birth, gender, linked_firebase_uid, registered_at, created_at, final_expire_at, current_pass, total_paid_won, status"
      )
      .eq("center_id", ctx.centerId)
      .in("id", memberIds),
    // 회원권 미수금도 총 미수금에 합산
    supabase
      .from("crm_memberships")
      .select("member_id, outstanding_won")
      .eq("center_id", ctx.centerId)
      .in("member_id", memberIds)
      .in("status", ["valid", "expired"]),
  ]);

  const mbOutstanding = new Map<number, number>();
  for (const m of mbs ?? []) {
    if (m.member_id == null) continue;
    mbOutstanding.set(m.member_id, (mbOutstanding.get(m.member_id) ?? 0) + (m.outstanding_won ?? 0));
  }

  const rows = (members ?? [])
    .filter((m) => m.status !== "deleted")
    .map((m) => {
      const a = agg.get(m.id);
      return {
        id: m.id,
        name: m.name,
        phone: m.phone,
        birth: m.birth,
        gender: m.gender,
        linked: !!m.linked_firebase_uid,
        registered_at: m.registered_at ?? (m.created_at ? String(m.created_at).slice(0, 10) : null),
        final_expire_at: m.final_expire_at,
        current_pass: a?.latest_pass ?? m.current_pass ?? null,
        has_pt: a?.has_pt ?? false,
        lesson_experience: a?.lesson_experience ?? false,
        total_paid_won: m.total_paid_won ?? 0,
        outstanding_total: (a?.pass_outstanding ?? 0) + (mbOutstanding.get(m.id) ?? 0),
      };
    })
    // 최근 구매 순(담당 수강권 최신 발급) 정렬
    .sort((x, y) => {
      const ax = agg.get(x.id)?.latest_issued ?? "";
      const ay = agg.get(y.id)?.latest_issued ?? "";
      return ax < ay ? 1 : ax > ay ? -1 : 0;
    });

  return NextResponse.json({ members: rows });
}
