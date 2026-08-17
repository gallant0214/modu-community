import { NextResponse, after } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { notifyStaffMember } from "@/app/lib/crm-staff-notify";

export const dynamic = "force-dynamic";

const ISSUE_TYPES = ["new", "renewal", "trial", "service"] as const;
const PAYMENT_METHODS = ["cash", "card", "transfer", "etc"] as const;

/**
 * GET /api/crm/passes?status=&trainer_id=&payment_method=&q=
 * 수강권 전체 목록 (PDF 4-1).
 *
 * trainer/manager 는 본인 담당(trainer_member_id) 또는 본인 판매(seller_member_id) 만.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const trainerId = url.searchParams.get("trainer_id");
  const paymentMethod = url.searchParams.get("payment_method");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 500);

  let query = supabase
    .from("crm_passes")
    .select(
      "id, member_id, trainer_member_id, co_trainer_ids, seller_member_id, issue_type, lesson_kind, total_sessions, remaining_sessions, session_minutes, price_won, payment_method, payment_method_custom, issued_at, start_date, expires_at, status, product_id, group_capacity, attendance_mileage_earn, created_at"
    )
    .eq("center_id", ctx.centerId)
    .order("issued_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);
  // 담당 강사 = 주강사(trainer_member_id) 또는 추가강사(co_trainer_ids 배열 포함)
  if (trainerId) {
    const tid = Number(trainerId);
    query = query.or(`trainer_member_id.eq.${tid},co_trainer_ids.cs.{${tid}}`);
  }
  if (paymentMethod) query = query.eq("payment_method", paymentMethod);

  // 1인 강사(solo owner)는 본인 센터 전체 접근 → 격리 미적용.
  if ((ctx.role === "trainer" || ctx.role === "manager") && !ctx.isSoloOwner) {
    query = query.or(
      `trainer_member_id.eq.${ctx.centerMemberId},seller_member_id.eq.${ctx.centerMemberId},co_trainer_ids.cs.{${ctx.centerMemberId}}`
    );
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  // 회원 이름 + 얼굴 썸네일 join (Supabase 단순화: 한 번 더 쿼리)
  type MemberLite = { id: number; name: string; phone: string | null; face_image_thumb: string | null };
  const memberIds = Array.from(new Set((data ?? []).map((p) => p.member_id)));
  const membersRes = memberIds.length
    ? await supabase
        .from("crm_members")
        .select("id, name, phone, face_image_thumb")
        .in("id", memberIds)
    : { data: [] };
  const members = (membersRes.data ?? []) as unknown as MemberLite[];
  const memberMap = new Map(members.map((m) => [m.id, m]));

  return NextResponse.json({
    passes: (data ?? []).map((p) => ({
      ...p,
      member_name: memberMap.get(p.member_id)?.name ?? "",
      member_phone: memberMap.get(p.member_id)?.phone ?? null,
      member_face_thumb: memberMap.get(p.member_id)?.face_image_thumb ?? null,
    })),
  });
}

/**
 * POST /api/crm/passes — 수강권 발급
 *
 * owner/admin/manager 디폴트 허용. trainer 는 can_issue_pass 권한이 켜져 있을 때만.
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  // trainer 권한 체크
  if (ctx.role === "trainer") {
    const { data: perm } = await supabase
      .from("crm_trainer_permissions")
      .select("can_issue_pass")
      .eq("center_member_id", ctx.centerMemberId)
      .maybeSingle();
    if (!perm?.can_issue_pass) {
      return NextResponse.json({ error: "수강권 발급 권한이 없습니다" }, { status: 403 });
    }
  }

  let body: {
    member_id?: number;
    trainer_member_id?: number;
    seller_member_id?: number;
    issue_type?: string;
    lesson_kind?: string;
    total_sessions?: number;
    /** 서비스(무상) 회차 — 있으면 본 수강권과 별개로 '서비스 수강권'을 0원으로 추가 발급 */
    service_sessions?: number;
    session_minutes?: number;
    price_won?: number;
    payment_method?: string;
    payment_method_custom?: string;
    issued_at?: string;
    start_date?: string;
    expires_at?: string;
    vat_included?: boolean;
    memo?: string;
    co_trainer_ids?: number[];
    /** 발급 시점에 받은 금액. 미입력 시 price_won 전액(=완납) 으로 간주. */
    paid_amount_won?: number;
    /** 발급 소스 상품(있으면 정원·유형 스냅샷용). */
    product_id?: number;
    /** 이용 방식. 'period'(기간제)면 총 세션 수 없이 만료일로만 관리(총 세션 0 허용). 저장 컬럼 없음(검증용). */
    billing_mode?: "count" | "period";
    /** 그룹 수업 정원(수기 발급 시). 상품 선택 발급은 상품 정원을 우선 사용. */
    group_capacity?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const memberId = Number(body.member_id);
  const trainerMemberId = Number(body.trainer_member_id);
  const sellerMemberId = Number(body.seller_member_id) || trainerMemberId;
  if (!memberId || !trainerMemberId) {
    return NextResponse.json({ error: "회원과 담당 강사가 필요합니다" }, { status: 400 });
  }
  const issueType = body.issue_type;
  if (!issueType || !ISSUE_TYPES.includes(issueType as (typeof ISSUE_TYPES)[number])) {
    return NextResponse.json({ error: "발급 유형이 잘못됨" }, { status: 400 });
  }
  const paymentMethod = body.payment_method;
  if (!paymentMethod || !PAYMENT_METHODS.includes(paymentMethod as (typeof PAYMENT_METHODS)[number])) {
    return NextResponse.json({ error: "결제 수단이 잘못됨" }, { status: 400 });
  }

  // 기간제(period)는 총 세션 수 없이 만료일로만 관리하므로 total_sessions 필수 아님.
  const isPeriod = body.billing_mode === "period";
  if (
    !body.lesson_kind?.trim() ||
    !body.session_minutes ||
    !body.issued_at ||
    !body.expires_at ||
    (!isPeriod && !body.total_sessions)
  ) {
    return NextResponse.json({ error: "필수 항목이 비어있습니다" }, { status: 400 });
  }

  // 회원·강사가 본 센터 소속인지 확인
  const [{ data: m }, { data: t }] = await Promise.all([
    supabase
      .from("crm_members")
      .select("id")
      .eq("id", memberId)
      .eq("center_id", ctx.centerId)
      .maybeSingle(),
    supabase
      .from("crm_center_members")
      .select("id")
      .eq("id", trainerMemberId)
      .eq("center_id", ctx.centerId)
      .maybeSingle(),
  ]);
  if (!m || !t) {
    return NextResponse.json({ error: "회원 또는 강사를 찾을 수 없습니다" }, { status: 404 });
  }

  // 추가 강사(공동 진행) — 본인 센터 소속 + 주 강사 제외 + 중복 제거
  let coTrainerIds: number[] = [];
  const reqCo = Array.from(
    new Set(
      (Array.isArray(body.co_trainer_ids) ? body.co_trainer_ids : [])
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n > 0 && n !== trainerMemberId)
    )
  );
  if (reqCo.length) {
    const { data: validCo } = await supabase
      .from("crm_center_members")
      .select("id")
      .eq("center_id", ctx.centerId)
      .in("id", reqCo);
    coTrainerIds = (validCo ?? []).map((v) => v.id);
  }

  // 상품(선택 시) → 그룹 정원 · 출석 마일리지 스냅샷. 개인 레슨/유형 없음 = 1.
  let productId: number | null = null;
  let groupCapacity = 1;
  let productAttendanceMileage = 0;
  if (body.product_id) {
    const { data: prod } = await supabase
      .from("crm_products")
      .select("id, type, capacity, attendance_mileage_earn")
      .eq("id", Number(body.product_id))
      .eq("center_id", ctx.centerId)
      .maybeSingle();
    if (prod) {
      productId = prod.id;
      if ((prod as { type: string }).type === "group") {
        const cap = Number((prod as { capacity: number | null }).capacity ?? 0);
        groupCapacity = cap > 1 ? Math.min(cap, 999) : 1;
      }
      productAttendanceMileage = Math.max(
        0,
        Math.floor(Number((prod as { attendance_mileage_earn?: number }).attendance_mileage_earn) || 0)
      );
    }
  }
  // 수기 발급(상품 미선택)에서 넘어온 그룹 정원 사용.
  if (!productId && body.group_capacity) {
    const cap = Math.floor(Number(body.group_capacity) || 0);
    groupCapacity = cap > 1 ? Math.min(cap, 999) : 1;
  }

  const totalSessions = Number(body.total_sessions) || 0;
  const priceWon = Number(body.price_won) || 0;
  const paidAmount =
    body.paid_amount_won === undefined
      ? priceWon
      : Math.max(0, Math.min(Math.floor(Number(body.paid_amount_won) || 0), priceWon));
  const outstanding = priceWon - paidAmount;
  const paymentStatus = outstanding <= 0 ? "paid" : paidAmount > 0 ? "partial" : "unpaid";

  const { data: created, error } = await supabase
    .from("crm_passes")
    .insert({
      center_id: ctx.centerId,
      member_id: memberId,
      trainer_member_id: trainerMemberId,
      co_trainer_ids: coTrainerIds,
      seller_member_id: sellerMemberId,
      issue_type: issueType,
      lesson_kind: body.lesson_kind.trim(),
      total_sessions: totalSessions,
      remaining_sessions: totalSessions,
      session_minutes: Number(body.session_minutes),
      price_won: priceWon,
      payment_method: paymentMethod,
      payment_method_custom: paymentMethod === "etc" ? body.payment_method_custom?.trim() || null : null,
      vat_included: !!body.vat_included,
      issued_at: body.issued_at,
      start_date: body.start_date || body.issued_at,
      expires_at: body.expires_at,
      status: "valid",
      memo: body.memo?.trim() || null,
      outstanding_won: outstanding,
      payment_status: paymentStatus,
      product_id: productId,
      group_capacity: groupCapacity,
      attendance_mileage_earn: productAttendanceMileage,
    })
    .select("id")
    .single();

  if (error || !created) {
    return NextResponse.json({ error: "발급 실패", detail: error?.message }, { status: 500 });
  }

  // 초기 결제 금액이 있으면 payment 기록 추가
  if (paidAmount > 0) {
    await supabase.from("crm_payments").insert({
      center_id: ctx.centerId,
      member_id: memberId,
      pass_id: created.id,
      amount_won: paidAmount,
      method: paymentMethod,
      method_custom: paymentMethod === "etc" ? body.payment_method_custom?.trim() || null : null,
      paid_at: new Date().toISOString(),
      recorded_by_uid: ctx.uid,
      status: "completed",
    });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "pass.issue",
    entity_type: "pass",
    entity_id: created.id,
    payload: {
      member_id: memberId,
      trainer_member_id: trainerMemberId,
      lesson_kind: body.lesson_kind.trim(),
      total_sessions: totalSessions,
      price_won: Number(body.price_won) || 0,
    } as never,
  });

  // 서비스(무상) 회차: 본 수강권과 별개로 '서비스 수강권'을 0원으로 추가 발급.
  // 담당강사·추가강사·시작일·만료일·수업시간 등은 본 수강권과 동일. (수업료 계산 오류 방지)
  let servicePassId: number | null = null;
  const serviceSessions = Math.max(0, Math.floor(Number(body.service_sessions) || 0));
  if (serviceSessions > 0) {
    const baseName =
      body.lesson_kind.trim().replace(/\s*\(\d+회\)\s*$/, "").trim() || body.lesson_kind.trim();
    const serviceName = `${baseName} 서비스(${serviceSessions}회)`;
    const { data: svc } = await supabase
      .from("crm_passes")
      .insert({
        center_id: ctx.centerId,
        member_id: memberId,
        trainer_member_id: trainerMemberId,
        co_trainer_ids: coTrainerIds,
        seller_member_id: sellerMemberId,
        issue_type: "service",
        lesson_kind: serviceName,
        total_sessions: serviceSessions,
        remaining_sessions: serviceSessions,
        session_minutes: Number(body.session_minutes),
        price_won: 0,
        payment_method: paymentMethod,
        payment_method_custom:
          paymentMethod === "etc" ? body.payment_method_custom?.trim() || null : null,
        vat_included: false,
        issued_at: body.issued_at,
        start_date: body.start_date || body.issued_at,
        expires_at: body.expires_at,
        status: "valid",
        memo: body.memo?.trim() || null,
        outstanding_won: 0,
        payment_status: "paid",
        product_id: productId,
        group_capacity: groupCapacity,
        attendance_mileage_earn: productAttendanceMileage,
      })
      .select("id")
      .single();
    if (svc) {
      servicePassId = svc.id;
      await supabase.from("crm_audit_logs").insert({
        center_id: ctx.centerId,
        actor_uid: ctx.uid,
        action: "pass.issue",
        entity_type: "pass",
        entity_id: svc.id,
        payload: {
          member_id: memberId,
          trainer_member_id: trainerMemberId,
          lesson_kind: serviceName,
          total_sessions: serviceSessions,
          price_won: 0,
          service: true,
        } as never,
      });
    }
    // 서비스 수강권은 결제기록 없음(0원). 배정 알림은 본 수강권 것으로 갈음(중복 발송 방지).
  }

  // 배정 알림 — 주강사/추가강사(본인 제외)에게 "회원이 배정되었습니다" (알림함 + 푸시)
  const assignTargets = Array.from(
    new Set([trainerMemberId, ...coTrainerIds].filter((id) => id && id !== ctx.centerMemberId))
  );
  if (assignTargets.length > 0) {
    after(async () => {
      const { data: mem } = await supabase
        .from("crm_members")
        .select("name")
        .eq("id", memberId)
        .maybeSingle();
      const memberName = mem?.name ?? "회원";
      for (const tid of assignTargets) {
        const isCo = tid !== trainerMemberId;
        await notifyStaffMember({
          centerId: ctx.centerId,
          centerMemberId: tid,
          type: "member_assigned",
          title: "회원 배정",
          body: isCo
            ? `${memberName}님의 추가 강사로 배정되었습니다`
            : `${memberName}님이 배정되었습니다`,
          data: { kind: "member_assigned", member_id: String(memberId) },
        }).catch(() => {});
      }
    });
  }

  return NextResponse.json({ ok: true, passId: created.id, servicePassId });
}
