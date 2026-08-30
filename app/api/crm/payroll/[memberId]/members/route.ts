import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";

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
  if (!isAdmin && !isSelf && !(await ctxHasPermission(ctx, "sales.payroll_view"))) {
    return NextResponse.json({ error: "본인 담당 회원만 조회할 수 있습니다" }, { status: 403 });
  }

  // 담당 수강권(주강사 또는 추가강사) — 회원 집계용
  const { data: passes, error } = await supabase
    .from("crm_passes")
    .select("member_id, lesson_kind, total_sessions, remaining_sessions, issued_at, expires_at, outstanding_won, status, product_id, group_capacity")
    .eq("center_id", ctx.centerId)
    .neq("status", "deleted")
    .or(`trainer_member_id.eq.${trainerId},co_trainer_ids.cs.{${trainerId}}`)
    .order("issued_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  const todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  // 회원별 집계 (최근 상품/종류 / PT 여부 / 레슨 경험 / 유효 여부 / 수강권 미수금)
  type Agg = {
    latest_pass: string | null;
    latest_issued: string | null;
    latest_product_id: number | null;
    latest_group_capacity: number;
    has_pt: boolean;
    lesson_experience: boolean;
    valid: boolean;
    pass_outstanding: number;
  };
  const agg = new Map<number, Agg>();
  for (const p of passes ?? []) {
    if (p.member_id == null) continue;
    const cur =
      agg.get(p.member_id) ??
      { latest_pass: null, latest_issued: null, latest_product_id: null, latest_group_capacity: 1, has_pt: false, lesson_experience: false, valid: false, pass_outstanding: 0 };
    // passes 는 issued_at desc 정렬 → 첫 등장이 최신
    if (cur.latest_issued == null) {
      cur.latest_pass = p.lesson_kind ?? null;
      cur.latest_issued = p.issued_at ?? null;
      cur.latest_product_id = (p as { product_id?: number | null }).product_id ?? null;
      cur.latest_group_capacity = (p as { group_capacity?: number | null }).group_capacity ?? 1;
    }
    if ((p.total_sessions ?? 0) > 0) cur.has_pt = true;
    // 총 세션보다 잔여가 적으면 한 번 이상 수업(출석)한 것 → 개인 레슨 경험
    if ((p.total_sessions ?? 0) > 0 && (p.remaining_sessions ?? 0) < (p.total_sessions ?? 0)) {
      cur.lesson_experience = true;
    }
    // 유효 수강권 = valid + 기간 유효(무기한 포함) + (횟수제면 잔여>0)
    const notExpired = p.expires_at === "9999-12-31" || (p.expires_at ?? "") >= todayKst;
    const hasRemaining = (p.total_sessions ?? 0) === 0 || (p.remaining_sessions ?? 0) > 0;
    if (p.status === "valid" && notExpired && hasRemaining) cur.valid = true;
    cur.pass_outstanding += p.outstanding_won ?? 0;
    agg.set(p.member_id, cur);
  }

  const memberIds = Array.from(agg.keys());
  if (memberIds.length === 0) {
    return NextResponse.json({ members: [] });
  }

  // 최근 수강권의 상품 유형 → 종류(개인레슨/그룹레슨/클래스수업)
  const productIds = Array.from(
    new Set(Array.from(agg.values()).map((a) => a.latest_product_id).filter((v): v is number => !!v))
  );
  const prodType = new Map<number, string>();
  if (productIds.length > 0) {
    const { data: prods } = await supabase
      .from("crm_products")
      .select("id, type")
      .eq("center_id", ctx.centerId)
      .in("id", productIds);
    for (const pr of (prods ?? []) as { id: number; type: string | null }[]) {
      if (pr.type) prodType.set(pr.id, pr.type);
    }
  }
  const lessonTypeOf = (a: Agg | undefined): string => {
    const t = a?.latest_product_id ? prodType.get(a.latest_product_id) : null;
    if (t === "class") return "클래스수업";
    if (t === "group") return "그룹레슨";
    if (t === "personal") return "개인레슨";
    return (a?.latest_group_capacity ?? 1) > 1 ? "그룹레슨" : "개인레슨";
  };

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
        lesson_type: lessonTypeOf(a),
        status: a?.valid ? "유효" : "만료",
        lesson_experience: a?.lesson_experience ?? false,
        total_paid_won: m.total_paid_won ?? 0,
        outstanding_total: (a?.pass_outstanding ?? 0) + (mbOutstanding.get(m.id) ?? 0),
      };
    })
    // 유효 회원 먼저, 그 안에서 최근 구매 순(담당 수강권 최신 발급) 정렬
    .sort((x, y) => {
      if (x.status !== y.status) return x.status === "유효" ? -1 : 1;
      const ax = agg.get(x.id)?.latest_issued ?? "";
      const ay = agg.get(y.id)?.latest_issued ?? "";
      return ax < ay ? 1 : ax > ay ? -1 : 0;
    });

  return NextResponse.json({ members: rows });
}
