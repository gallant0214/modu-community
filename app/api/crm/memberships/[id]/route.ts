import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";
import { syncProductPaymentAmount, syncProductPaymentDate } from "@/app/lib/crm-payment-sync";

export const dynamic = "force-dynamic";

const PAYMENT_METHODS = ["cash", "card", "transfer", "etc"];

/**
 * PATCH /api/crm/memberships/[id] — 결제 상세 수정.
 * 만료일/메모 외 금액·할인·부가세·결제수단·담당자·기간·구매일 편집은 sales.edit 권한 필요.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const mid = Number(id);
  if (!mid) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  // 현재 값 로드 (센터 격리 + status 재계산용)
  const { data: current } = await supabase
    .from("crm_memberships")
    .select("status, expires_at, price_won")
    .eq("id", mid)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: "회원권을 찾을 수 없습니다" }, { status: 404 });

  let body: {
    expires_at?: string;
    start_date?: string;
    purchased_at?: string;
    paid_at?: string; // 결제내역의 결제일 동기화 + purchased_at 기본값
    memo?: string;
    price_won?: number;
    discount_won?: number;
    vat_included?: boolean;
    payment_method?: string;
    payment_method_custom?: string;
    seller_member_id?: number;
    attendance_mileage_earn?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  // 결제 항목(금액·할인·부가세·결제수단·담당자·기간·구매일) 변경은 sales.edit 권한 필요
  const touchesPayment =
    body.price_won !== undefined ||
    body.discount_won !== undefined ||
    body.vat_included !== undefined ||
    body.payment_method !== undefined ||
    body.seller_member_id !== undefined ||
    body.start_date !== undefined ||
    body.purchased_at !== undefined ||
    body.paid_at !== undefined;
  if (touchesPayment) {
    const perms = await loadPermissionsForContext(ctx);
    if (!perms["sales.edit"]) {
      return NextResponse.json({ error: "결제 수정 권한이 없습니다" }, { status: 403 });
    }
  }

  const patch: Record<string, unknown> = {};
  if (body.expires_at) patch.expires_at = body.expires_at;
  if (body.start_date) patch.start_date = body.start_date;
  // 결제일만 보낸 경우에도 구매일(purchased_at)을 같은 날로 맞춘다 — '마지막 구매일' 표시 기준.
  if (!body.purchased_at && body.paid_at && /^\d{4}-\d{2}-\d{2}$/.test(body.paid_at)) {
    patch.purchased_at = body.paid_at;
  }
  if (body.purchased_at && /^\d{4}-\d{2}-\d{2}$/.test(body.purchased_at)) {
    patch.purchased_at = body.purchased_at;
  }
  if (body.memo !== undefined) patch.memo = body.memo?.trim() || null;
  if (body.price_won !== undefined) patch.price_won = Math.max(0, Math.floor(Number(body.price_won) || 0));
  if (body.discount_won !== undefined) patch.discount_won = Math.max(0, Math.floor(Number(body.discount_won) || 0));
  if (body.vat_included !== undefined) patch.vat_included = !!body.vat_included;
  if (body.payment_method !== undefined) {
    if (!PAYMENT_METHODS.includes(body.payment_method)) {
      return NextResponse.json({ error: "결제 수단이 잘못됨" }, { status: 400 });
    }
    patch.payment_method = body.payment_method;
    patch.payment_method_custom =
      body.payment_method === "etc" ? body.payment_method_custom?.trim() || null : null;
  }
  if (body.seller_member_id !== undefined && Number(body.seller_member_id) > 0) {
    patch.seller_member_id = Number(body.seller_member_id);
  }
  if (body.attendance_mileage_earn !== undefined) {
    patch.attendance_mileage_earn = Math.max(
      0,
      Math.floor(Number(body.attendance_mileage_earn) || 0)
    );
  }
  // 유효기간 변경 시 status 재계산 (기간제: 만료일 기준. 환불은 유지).
  // → 무기한(9999)/기간 연장 시 자동으로 '유효'로 전환.
  const cm = current as { status: string; expires_at: string | null };
  if (cm.status !== "refunded" && patch.expires_at !== undefined) {
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const eff = patch.expires_at as string;
    patch.status = !eff || String(eff).slice(0, 10) >= today ? "valid" : "expired";
  }

  // 결제일만 바꾸는 요청(상품 컬럼 변화 없음)도 허용 — 결제내역 동기화가 실제 변경이다.
  if (body.paid_at) patch.updated_at = new Date().toISOString();
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 항목이 없습니다" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_memberships")
    .update(patch as never)
    .eq("id", mid)
    .eq("center_id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "수정 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "membership.update",
    entity_type: "crm_memberships",
    entity_id: mid,
    payload: patch as never,
  });

  // 결제일을 바꿨으면 연결된 결제내역의 결제일도 맞춘다(단일 결제만).
  if (body.paid_at) {
    await syncProductPaymentDate({
      centerId: ctx.centerId,
      actorUid: ctx.uid,
      link: "membership_id",
      productId: mid,
      paidYmd: body.paid_at,
    });
  }

  // 가격을 바꿨으면 연결된 결제내역 금액도 맞춘다(단일 전액 결제만 — 분할/부분입금은 보존).
  if (patch.price_won !== undefined) {
    await syncProductPaymentAmount({
      centerId: ctx.centerId,
      actorUid: ctx.uid,
      link: "membership_id",
      productId: mid,
      oldPrice: (current as { price_won?: number | null }).price_won ?? -1,
      newPrice: patch.price_won as number,
    });
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/crm/memberships/[id] — 환불 처리 (status='refunded').
 * sales.refund 권한 필요 (설정 > 권한에서 부여).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const perms = await loadPermissionsForContext(ctx);
  if (!perms["sales.refund"]) {
    return NextResponse.json({ error: "회원권 환불 권한이 없습니다" }, { status: 403 });
  }

  const { id } = await params;
  const mid = Number(id);
  if (!mid) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { error } = await supabase
    .from("crm_memberships")
    .update({ status: "refunded" } as never)
    .eq("id", mid)
    .eq("center_id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "환불 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "membership.refund",
    entity_type: "crm_memberships",
    entity_id: mid,
    payload: null,
  });

  return NextResponse.json({ ok: true });
}
