import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

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
      "id, member_id, trainer_member_id, co_trainer_ids, seller_member_id, issue_type, lesson_kind, total_sessions, remaining_sessions, session_minutes, price_won, payment_method, payment_method_custom, issued_at, start_date, expires_at, status, created_at"
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

  if (ctx.role === "trainer" || ctx.role === "manager") {
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

  if (
    !body.lesson_kind?.trim() ||
    !body.total_sessions ||
    !body.session_minutes ||
    !body.issued_at ||
    !body.expires_at
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

  const totalSessions = Number(body.total_sessions);
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

  return NextResponse.json({ ok: true, passId: created.id });
}
