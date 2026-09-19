import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { effectiveStatus, kstTodayYmd, PRODUCT_TYPE_LABEL } from "@/app/lib/crm-coupons";
import { loadCoupons, paginateAll, validateCouponInput } from "@/app/lib/crm-coupons-db";
import { staffDisplayName } from "@/app/lib/crm-coupons-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/coupons?status=active|archived|all
 * 쿠폰 목록 + 쿠폰별 발급/사용/회수/만료 집계 + 전체 요약.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "coupons.view"))) {
    return NextResponse.json({ error: "쿠폰 조회 권한이 없습니다" }, { status: 403 });
  }
  const status = new URL(request.url).searchParams.get("status") || "active";

  const coupons = await loadCoupons(ctx.centerId);
  const issues = await paginateAll<{
    coupon_id: number;
    status: string;
    expires_at: string | null;
    discount_applied_won: number | null;
    original_price_won: number | null;
  }>((f, t) =>
    supabase
      .from("crm_coupon_issues")
      .select("coupon_id, status, expires_at, discount_applied_won, original_price_won")
      .eq("center_id", ctx.centerId)
      .range(f, t)
  );

  type Stat = { issued: number; available: number; used: number; revoked: number; expired: number; discount: number; sales: number };
  const blank = (): Stat => ({ issued: 0, available: 0, used: 0, revoked: 0, expired: 0, discount: 0, sales: 0 });
  const stats = new Map<number, Stat>();
  const total = blank();
  for (const i of issues) {
    const s = stats.get(Number(i.coupon_id)) ?? blank();
    const st = effectiveStatus(i);
    for (const bucket of [s, total]) {
      bucket.issued += 1;
      if (st === "issued") bucket.available += 1;
      else bucket[st] += 1;
      if (st === "used") {
        bucket.discount += Math.max(0, i.discount_applied_won ?? 0);
        // 쿠폰으로 끌어낸 매출 = 정가 - 쿠폰 할인
        bucket.sales += Math.max(0, (i.original_price_won ?? 0) - (i.discount_applied_won ?? 0));
      }
    }
    stats.set(Number(i.coupon_id), s);
  }

  const list = Array.from(coupons.values())
    .filter((c) => status === "all" || (c.status ?? "active") === status)
    .sort((a, b) => Number(b.id) - Number(a.id))
    .map((c) => {
      const s = stats.get(Number(c.id)) ?? blank();
      const usableCount = s.issued - s.revoked - s.expired;
      return {
        ...c,
        stats: { ...s, useRate: usableCount > 0 ? Math.round((s.used / usableCount) * 1000) / 10 : 0 },
        // 기간 만료형(until) 쿠폰이 이미 지난 날짜면 더 발송하지 못하게 표시
        sendable: (c.status ?? "active") === "active" && !(c.valid_mode === "until" && c.valid_until && c.valid_until < kstTodayYmd()),
      };
    });

  const usable = total.issued - total.revoked - total.expired;
  return NextResponse.json({
    coupons: list,
    summary: { ...total, useRate: usable > 0 ? Math.round((total.used / usable) * 1000) / 10 : 0 },
    productTypes: PRODUCT_TYPE_LABEL,
  });
}

/** POST /api/crm/coupons — 쿠폰 만들기 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "coupons.manage"))) {
    return NextResponse.json({ error: "쿠폰 관리 권한이 없습니다" }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const v = validateCouponInput(body);
  if (v.error) return NextResponse.json({ error: v.error }, { status: 400 });

  if (v.row?.gift_product_id) {
    const { data: gp } = await supabase
      .from("crm_products")
      .select("id")
      .eq("id", Number(v.row.gift_product_id))
      .eq("center_id", ctx.centerId)
      .maybeSingle();
    if (!gp) return NextResponse.json({ error: "증정 상품을 찾을 수 없어요" }, { status: 400 });
  }

  const name = await staffDisplayName(ctx.centerMemberId);
  const { data, error } = await supabase
    .from("crm_coupons")
    .insert({
      ...v.row,
      center_id: ctx.centerId,
      status: "active",
      created_by_uid: ctx.uid,
      created_by_name: name,
    } as never)
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "쿠폰 생성 실패", detail: error?.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "coupon.create",
    entity_type: "coupon",
    entity_id: (data as { id: number }).id,
    payload: { name: v.row?.name, benefit_type: v.row?.benefit_type } as never,
  });
  return NextResponse.json({ ok: true, id: (data as { id: number }).id });
}
