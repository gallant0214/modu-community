import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { benefitText, effectiveStatus, kstTodayYmd } from "@/app/lib/crm-coupons";
import {
  ISSUE_SELECT,
  loadCoupons,
  loadMemberNames,
  loadUsedRefNames,
  paginateAll,
  type IssueRowRaw,
} from "@/app/lib/crm-coupons-db";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/coupons/issues?status=&coupon_id=&send_id=&member_id=&q=&from=&to=
 *   status: all | issued(사용 가능) | used | revoked | expired
 *   from/to: 사용 이력 조회 시 사용일 범위 (YYYY-MM-DD)
 * 발급된 쿠폰(회원별 1장) 목록 — 사용 이력·보유 현황·회수 대상 조회에 공용.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "coupons.view"))) {
    return NextResponse.json({ error: "쿠폰 조회 권한이 없습니다" }, { status: 403 });
  }
  const sp = new URL(request.url).searchParams;
  const status = sp.get("status") || "all";
  const couponId = Number(sp.get("coupon_id")) || null;
  const sendId = Number(sp.get("send_id")) || null;
  const memberId = Number(sp.get("member_id")) || null;
  const q = (sp.get("q") || "").trim();
  const from = sp.get("from") || "";
  const to = sp.get("to") || "";
  const today = kstTodayYmd();

  const rows = await paginateAll<IssueRowRaw>((f, t) => {
    let qb = supabase.from("crm_coupon_issues").select(ISSUE_SELECT).eq("center_id", ctx.centerId);
    if (couponId) qb = qb.eq("coupon_id", couponId);
    if (sendId) qb = qb.eq("send_id", sendId);
    if (memberId) qb = qb.eq("member_id", memberId);
    // 상태 1차 필터 (만료는 저장값이 issued 라 아래에서 다시 거른다)
    if (status === "used") qb = qb.eq("status", "used");
    else if (status === "revoked") qb = qb.eq("status", "revoked");
    else if (status === "issued") qb = qb.eq("status", "issued").or(`expires_at.is.null,expires_at.gte.${today}`);
    else if (status === "expired") qb = qb.eq("status", "issued").lt("expires_at", today);
    if (status === "used" && /^\d{4}-\d{2}-\d{2}$/.test(from)) qb = qb.gte("used_at", `${from}T00:00:00+09:00`);
    if (status === "used" && /^\d{4}-\d{2}-\d{2}$/.test(to)) qb = qb.lte("used_at", `${to}T23:59:59.999+09:00`);
    return qb.order(status === "used" ? "used_at" : "issued_at", { ascending: false }).range(f, t);
  });

  const coupons = await loadCoupons(ctx.centerId, Array.from(new Set(rows.map((r) => Number(r.coupon_id)))));
  const members = await loadMemberNames(ctx.centerId, rows.map((r) => r.member_id));
  const refNames = await loadUsedRefNames(rows.map((r) => ({ kind: r.used_ref_kind, id: r.used_ref_id })));

  let list = rows.map((r) => {
    const c = coupons.get(Number(r.coupon_id));
    const m = members.get(r.member_id);
    return {
      id: r.id,
      code: r.code,
      couponId: r.coupon_id,
      couponName: c?.name ?? "(삭제된 쿠폰)",
      benefit: c ? benefitText(c) : "",
      memberId: r.member_id,
      memberName: m?.name ?? "(알 수 없음)",
      memberPhone: m?.phone ?? null,
      sendId: r.send_id,
      status: effectiveStatus(r),
      issuedAt: r.issued_at,
      expiresAt: r.expires_at,
      usedAt: r.used_at,
      usedByName: r.used_by_name,
      usedFor: r.used_ref_kind && r.used_ref_id ? refNames.get(`${r.used_ref_kind}:${r.used_ref_id}`) ?? null : null,
      usedRefKind: r.used_ref_kind,
      originalPriceWon: r.original_price_won,
      discountWon: r.discount_applied_won,
      revokedAt: r.revoked_at,
      revokedByName: r.revoked_by_name,
      revokeReason: r.revoke_reason,
    };
  });

  if (q) {
    const needle = q.replace(/[-\s]/g, "").toLowerCase();
    list = list.filter(
      (r) =>
        r.memberName.toLowerCase().includes(q.toLowerCase()) ||
        (r.memberPhone ?? "").replace(/\D/g, "").includes(needle) ||
        r.code.replace(/-/g, "").toLowerCase().includes(needle)
    );
  }

  const discountTotal = list.reduce((s, r) => s + (r.status === "used" ? r.discountWon ?? 0 : 0), 0);
  return NextResponse.json({ issues: list, total: list.length, discountTotal });
}
