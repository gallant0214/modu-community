import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { benefitText, effectiveStatus } from "@/app/lib/crm-coupons";
import { loadCoupons, paginateAll } from "@/app/lib/crm-coupons-db";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/coupons/sends?coupon_id=
 * 발송 기록 — 배치별 발급 수·채널 결과 + 지금까지의 사용/회수 현황.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "coupons.view"))) {
    return NextResponse.json({ error: "쿠폰 조회 권한이 없습니다" }, { status: 403 });
  }
  const couponId = Number(new URL(request.url).searchParams.get("coupon_id")) || null;

  let q = supabase
    .from("crm_coupon_sends")
    .select("*")
    .eq("center_id", ctx.centerId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (couponId) q = q.eq("coupon_id", couponId);
  const { data } = await q;
  const sends = (data ?? []) as {
    id: number;
    coupon_id: number;
    channel: string;
    message: string | null;
    recipient_count: number;
    skipped_count: number;
    push_sent: number;
    sms_sent: number;
    sms_failed: number;
    audience_kind: string | null;
    sent_by_name: string | null;
    created_at: string;
  }[];

  const sendIds = sends.map((s) => s.id);
  const issues = sendIds.length
    ? await paginateAll<{ send_id: number; status: string; expires_at: string | null }>((f, t) =>
        supabase
          .from("crm_coupon_issues")
          .select("send_id, status, expires_at")
          .in("send_id", sendIds)
          .range(f, t)
      )
    : [];
  const agg = new Map<number, { used: number; revoked: number; expired: number; available: number }>();
  for (const i of issues) {
    const a = agg.get(i.send_id) ?? { used: 0, revoked: 0, expired: 0, available: 0 };
    const st = effectiveStatus(i);
    if (st === "issued") a.available += 1;
    else a[st] += 1;
    agg.set(i.send_id, a);
  }
  const coupons = await loadCoupons(ctx.centerId, Array.from(new Set(sends.map((s) => Number(s.coupon_id)))));

  return NextResponse.json({
    sends: sends.map((s) => {
      const c = coupons.get(Number(s.coupon_id));
      return {
        ...s,
        coupon_name: c?.name ?? "(삭제된 쿠폰)",
        benefit: c ? benefitText(c) : "",
        usage: agg.get(s.id) ?? { used: 0, revoked: 0, expired: 0, available: 0 },
      };
    }),
  });
}
