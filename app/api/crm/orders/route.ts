import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/orders?status=&limit= — 온라인(홈페이지·회원앱) 주문 목록.
 *
 * 화면의 목적은 "돈은 받았는데 뭔가 어긋난 주문"을 직원이 놓치지 않는 것이다.
 *  · paid 인데 fail_reason 이 있음 → 결제됐는데 발급 실패. 가장 급하다
 *  · refunded             → PG 에서 취소됨. 발급물 처리 필요
 *  · pending              → 결제창까지 갔다 이탈. 시한 지나면 자동 정리된다
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "sales.view"))) {
    return NextResponse.json({ error: "매출 조회 권한이 없습니다" }, { status: 403 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "";
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 100));

  let q = supabase
    .from("crm_orders")
    .select(
      "id, member_id, product_name, product_type, list_price_won, coupon_discount_won, " +
        "mileage_used, mileage_earned, amount_won, status, channel, pg_method, pg_receipt_url, " +
        "pg_approved_at, issued_kind, issued_id, fail_reason, refunded_at, refund_amount, created_at"
    )
    .eq("center_id", ctx.centerId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status === "attention") {
    // 사람이 봐야 하는 것만 — 발급 실패 + 환불
    q = q.or("and(status.eq.paid,fail_reason.not.is.null),status.eq.refunded");
  } else if (status) {
    q = q.eq("status", status);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const memberIds = Array.from(new Set(rows.map((r) => Number(r.member_id)).filter(Boolean)));
  const nameMap = new Map<number, string>();
  if (memberIds.length) {
    const { data: members } = await supabase
      .from("crm_members")
      .select("id, name")
      .in("id", memberIds);
    for (const m of (members ?? []) as { id: number; name: string }[]) nameMap.set(m.id, m.name);
  }

  // 배지 숫자용 — 사람이 봐야 하는 건수
  const { count: attention } = await supabase
    .from("crm_orders")
    .select("id", { count: "exact", head: true })
    .eq("center_id", ctx.centerId)
    .or("and(status.eq.paid,fail_reason.not.is.null),status.eq.refunded");

  return NextResponse.json({
    orders: rows.map((r) => ({ ...r, member_name: nameMap.get(Number(r.member_id)) ?? "-" })),
    attentionCount: attention ?? 0,
  });
}
