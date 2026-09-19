import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { benefitText, conditionText, effectiveStatus } from "@/app/lib/crm-coupons";
import { ISSUE_SELECT, loadCoupons, type IssueRowRaw } from "@/app/lib/crm-coupons-db";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/coupons/member/[memberId]
 * 한 회원의 쿠폰함 — 발급창 쿠폰 선택·회원 상세 표시용.
 * 발급창에서 할인액을 미리 계산할 수 있도록 쿠폰 정의(혜택·조건)를 함께 내려준다.
 * (최종 판정은 발급 라우트가 서버에서 다시 한다)
 */
export async function GET(request: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  const memberId = Number((await params).memberId);

  const { data: m } = await supabase
    .from("crm_members")
    .select("id")
    .eq("id", memberId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!m) return NextResponse.json({ error: "회원을 찾을 수 없어요" }, { status: 404 });

  const { data } = await supabase
    .from("crm_coupon_issues")
    .select(ISSUE_SELECT)
    .eq("center_id", ctx.centerId)
    .eq("member_id", memberId)
    .order("issued_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as unknown as IssueRowRaw[];
  const coupons = await loadCoupons(ctx.centerId, Array.from(new Set(rows.map((r) => Number(r.coupon_id)))));

  return NextResponse.json({
    coupons: rows
      .map((r) => {
        const c = coupons.get(Number(r.coupon_id));
        if (!c) return null;
        return {
          issueId: r.id,
          code: r.code,
          status: effectiveStatus(r),
          issuedAt: r.issued_at,
          expiresAt: r.expires_at,
          usedAt: r.used_at,
          discountWon: r.discount_applied_won,
          name: c.name,
          benefit: benefitText(c),
          condition: conditionText(c),
          coupon: c,
        };
      })
      .filter(Boolean),
  });
}
