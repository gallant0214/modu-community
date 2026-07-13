import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

const PAYMENT_METHODS = ["cash", "card", "transfer", "etc"] as const;

/**
 * GET /api/crm/rentals?member_id=&status=
 * 대여권(운동복 등) 목록.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const memberId = url.searchParams.get("member_id");
  const status = url.searchParams.get("status");

  let query = supabase
    .from("crm_rentals")
    .select(
      "id, member_id, seller_member_id, item_name, price_won, discount_won, mileage_earned, mileage_used, vat_included, payment_method, payment_method_custom, start_date, expires_at, status, memo, created_at"
    )
    .eq("center_id", ctx.centerId)
    .neq("status", "deleted")
    .order("start_date", { ascending: false })
    .limit(500);

  if (memberId) query = query.eq("member_id", Number(memberId));
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ rentals: data ?? [] });
}

/**
 * POST /api/crm/rentals — 대여권(운동복 등) 발급
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  let body: {
    member_id?: number;
    seller_member_id?: number;
    item_name?: string;
    price_won?: number;
    discount_won?: number;
    mileage_earned?: number;
    mileage_used?: number;
    payment_method?: string;
    payment_method_custom?: string;
    start_date?: string;
    expires_at?: string;
    vat_included?: boolean;
    memo?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const memberId = Number(body.member_id);
  if (!memberId) return NextResponse.json({ error: "회원을 선택해 주세요" }, { status: 400 });

  const itemName = body.item_name?.trim();
  if (!itemName) return NextResponse.json({ error: "대여 품목을 입력해 주세요" }, { status: 400 });

  const paymentMethod = body.payment_method;
  if (!paymentMethod || !PAYMENT_METHODS.includes(paymentMethod as (typeof PAYMENT_METHODS)[number])) {
    return NextResponse.json({ error: "결제 수단이 잘못됨" }, { status: 400 });
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

  const { data: created, error } = await supabase
    .from("crm_rentals")
    .insert({
      center_id: ctx.centerId,
      member_id: memberId,
      seller_member_id: sellerId,
      item_name: itemName,
      price_won: Number(body.price_won) || 0,
      discount_won: Math.max(0, Math.floor(Number(body.discount_won) || 0)),
      mileage_earned: Math.max(0, Math.floor(Number(body.mileage_earned) || 0)),
      mileage_used: Math.max(0, Math.floor(Number(body.mileage_used) || 0)),
      vat_included: !!body.vat_included,
      payment_method: paymentMethod,
      payment_method_custom:
        paymentMethod === "etc" ? body.payment_method_custom?.trim() || null : null,
      start_date: body.start_date,
      expires_at: body.expires_at,
      status: "valid",
      memo: body.memo?.trim() || null,
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

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "rental.issue",
    entity_type: "crm_rentals",
    entity_id: created.id,
    payload: { item_name: itemName } as never,
  });

  return NextResponse.json({ ok: true, rentalId: created.id });
}
