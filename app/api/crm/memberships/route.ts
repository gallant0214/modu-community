import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

const PAYMENT_METHODS = ["cash", "card", "transfer", "etc"] as const;

/**
 * GET /api/crm/memberships?status=&q=&member_id=
 * 회원권 목록.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const memberId = url.searchParams.get("member_id");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 500);

  let query = supabase
    .from("crm_memberships")
    .select(
      "id, member_id, seller_member_id, plan_name, duration_days, price_won, discount_won, mileage_earned, mileage_used, attendance_mileage_earn, vat_included, payment_method, payment_method_custom, start_date, expires_at, purchased_at, status, memo, outstanding_won, payment_status, is_paused, created_at"
    )
    .eq("center_id", ctx.centerId)
    .neq("status", "deleted")
    .order("purchased_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);
  if (memberId) query = query.eq("member_id", Number(memberId));

  // 데이터 격리: 강사/매니저(1인 강사 제외)는 본인이 판매한 회원권만.
  // (수강권·상담·회원 목록과 동일 정책 — feedback: trainer/manager는 본인 데이터만)
  if ((ctx.role === "trainer" || ctx.role === "manager") && !ctx.isSoloOwner) {
    query = query.eq("seller_member_id", ctx.centerMemberId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  // 회원 이름 + 얼굴 썸네일 join
  type MemberLite = { id: number; name: string; phone: string | null; face_image_thumb: string | null };
  const memberIds = Array.from(new Set((data ?? []).map((p) => p.member_id)));
  const membersRes = memberIds.length
    ? await supabase.from("crm_members").select("id, name, phone, face_image_thumb").in("id", memberIds)
    : { data: [] };
  const members = (membersRes.data ?? []) as unknown as MemberLite[];
  const memberMap = new Map(members.map((m) => [m.id, m]));

  return NextResponse.json({
    memberships: (data ?? []).map((p) => ({
      ...p,
      member_name: memberMap.get(p.member_id)?.name ?? "",
      member_phone: memberMap.get(p.member_id)?.phone ?? null,
      member_face_thumb: memberMap.get(p.member_id)?.face_image_thumb ?? null,
    })),
  });
}

/**
 * POST /api/crm/memberships — 회원권 발급
 *
 * owner/admin/manager 디폴트 허용. trainer 는 제한 없음 (회원권은 모두 발급 가능 정책).
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  let body: {
    member_id?: number;
    seller_member_id?: number;
    plan_name?: string;
    duration_days?: number;
    price_won?: number;
    discount_won?: number;
    payment_method?: string;
    payment_method_custom?: string;
    start_date?: string;
    expires_at?: string;
    purchased_at?: string;
    vat_included?: boolean;
    memo?: string;
    mileage_earned?: number;
    mileage_used?: number;
    /** 이 회원권 회원이 출석할 때 하루 1회 적립할 마일리지 (상품에서 스냅샷). */
    attendance_mileage_earn?: number;
    /** 발급 시점에 받은 금액. 미입력 시 price_won 전액. */
    paid_amount_won?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const memberId = Number(body.member_id);
  if (!memberId) return NextResponse.json({ error: "회원을 선택해 주세요" }, { status: 400 });

  const paymentMethod = body.payment_method;
  if (!paymentMethod || !PAYMENT_METHODS.includes(paymentMethod as (typeof PAYMENT_METHODS)[number])) {
    return NextResponse.json({ error: "결제 수단이 잘못됨" }, { status: 400 });
  }

  const plan = body.plan_name?.trim();
  const duration = Number(body.duration_days);
  if (!plan || !duration || duration < 1) {
    return NextResponse.json({ error: "플랜명과 기간을 입력해 주세요" }, { status: 400 });
  }
  if (!body.start_date || !body.expires_at) {
    return NextResponse.json({ error: "시작일과 만료일을 입력해 주세요" }, { status: 400 });
  }

  const { data: m } = await supabase
    .from("crm_members")
    .select("id")
    .eq("id", memberId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!m) return NextResponse.json({ error: "회원을 찾을 수 없습니다" }, { status: 404 });

  const sellerId = Number(body.seller_member_id) || ctx.centerMemberId;
  const priceWon = Number(body.price_won) || 0;
  const paidAmount =
    body.paid_amount_won === undefined
      ? priceWon
      : Math.max(0, Math.min(Math.floor(Number(body.paid_amount_won) || 0), priceWon));
  const outstanding = priceWon - paidAmount;
  const paymentStatus = outstanding <= 0 ? "paid" : paidAmount > 0 ? "partial" : "unpaid";

  const { data: created, error } = await supabase
    .from("crm_memberships")
    .insert({
      center_id: ctx.centerId,
      member_id: memberId,
      seller_member_id: sellerId,
      plan_name: plan,
      duration_days: duration,
      price_won: priceWon,
      discount_won: Math.max(0, Math.floor(Number(body.discount_won) || 0)),
      mileage_earned: Math.max(0, Math.floor(Number(body.mileage_earned) || 0)),
      mileage_used: Math.max(0, Math.floor(Number(body.mileage_used) || 0)),
      attendance_mileage_earn: Math.max(0, Math.floor(Number(body.attendance_mileage_earn) || 0)),
      vat_included: !!body.vat_included,
      payment_method: paymentMethod,
      payment_method_custom: paymentMethod === "etc" ? body.payment_method_custom?.trim() || null : null,
      start_date: body.start_date,
      expires_at: body.expires_at,
      purchased_at: /^\d{4}-\d{2}-\d{2}$/.test(body.purchased_at ?? "")
        ? body.purchased_at
        : kstYmd(),
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

  // 마일리지 적립/사용 → 회원 잔고 갱신
  const mileageEarned = Math.max(0, Math.floor(Number(body.mileage_earned) || 0));
  const mileageUsed = Math.max(0, Math.floor(Number(body.mileage_used) || 0));
  if (mileageEarned > 0 || mileageUsed > 0) {
    const { data: mem } = await supabase
      .from("crm_members")
      .select("mileage")
      .eq("id", memberId)
      .eq("center_id", ctx.centerId)
      .maybeSingle();
    const nextMileage = Math.max(0, (mem?.mileage ?? 0) + mileageEarned - mileageUsed);
    await supabase
      .from("crm_members")
      .update({ mileage: nextMileage } as never)
      .eq("id", memberId)
      .eq("center_id", ctx.centerId);
  }

  // 결제일(paid_at): 당일 구매면 실제 결제 시각, 과거 날짜면 그 구매일(정오).
  const purchasedYmd = /^\d{4}-\d{2}-\d{2}$/.test(body.purchased_at ?? "")
    ? (body.purchased_at as string)
    : body.start_date || kstYmd();
  const paidAtIso =
    purchasedYmd < kstYmd()
      ? new Date(`${purchasedYmd}T12:00:00+09:00`).toISOString()
      : new Date().toISOString();
  if (paidAmount > 0) {
    await supabase.from("crm_payments").insert({
      center_id: ctx.centerId,
      member_id: memberId,
      membership_id: created.id,
      amount_won: paidAmount,
      method: paymentMethod,
      method_custom: paymentMethod === "etc" ? body.payment_method_custom?.trim() || null : null,
      paid_at: paidAtIso,
      recorded_by_uid: ctx.uid,
      status: "completed",
    });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "membership.issue",
    entity_type: "crm_memberships",
    entity_id: created.id,
    payload: {
      member_id: memberId,
      plan_name: plan,
      duration_days: duration,
      price_won: Number(body.price_won) || 0,
      ...(mileageUsed > 0 ? { mileage_used: mileageUsed } : {}),
    } as never,
  });

  return NextResponse.json({ ok: true, membershipId: created.id });
}

function kstYmd(): string {
  const now = new Date();
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
