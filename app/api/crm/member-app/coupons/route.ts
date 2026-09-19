import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";
import { effectiveStatus } from "@/app/lib/crm-coupons";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/member-app/coupons?centerId=
 * 내 보유 쿠폰 목록 (표시 전용 — 사용 처리는 CRM 발급창에서만).
 * crm_coupon_issues(회원 발급건) + crm_coupons(정의) 조인.
 *  - 회수(revoked)는 제외.
 *  - 상태는 공용 effectiveStatus()로 계산: issued→active(사용가능), used, expired(expires_at 기준).
 *  - 정렬: 사용가능(만료 임박순) → 사용완료 → 만료(최신 발급순).
 */
export async function GET(request: Request) {
  const centerId = Number(new URL(request.url).searchParams.get("centerId"));
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  const { data: issues } = await supabase
    .from("crm_coupon_issues")
    .select("id, coupon_id, status, issued_at, expires_at, used_at")
    .eq("center_id", ctx.centerId)
    .eq("member_id", ctx.memberId)
    .neq("status", "revoked")
    .order("issued_at", { ascending: false });

  const couponIds = Array.from(
    new Set((issues ?? []).map((i) => i.coupon_id).filter((v): v is number => !!v))
  );
  type Def = {
    id: number;
    name: string;
    description: string | null;
    benefit_type: string;
    amount_won: number | null;
    percent: number | null;
    max_discount_won: number | null;
  };
  const defMap = new Map<number, Def>();
  if (couponIds.length) {
    const { data: defs } = await supabase
      .from("crm_coupons")
      .select("id, name, description, benefit_type, amount_won, percent, max_discount_won")
      .in("id", couponIds);
    for (const d of (defs ?? []) as Def[]) defMap.set(d.id, d);
  }

  const rank: Record<string, number> = { active: 0, used: 1, expired: 2 };
  const coupons = (issues ?? [])
    .map((i) => {
      const d = defMap.get(i.coupon_id as number);
      if (!d) return null;
      const eff = effectiveStatus({ status: i.status, expires_at: i.expires_at });
      if (eff === "revoked") return null;
      const status = eff === "used" ? "used" : eff === "expired" ? "expired" : "active";
      return {
        id: i.id,
        name: d.name,
        description: d.description ?? null,
        benefitType: d.benefit_type,
        amountWon: d.amount_won ?? null,
        percent: d.percent ?? null,
        maxDiscountWon: d.max_discount_won ?? null,
        expiresAt: i.expires_at,
        status,
        usedAt: i.used_at ?? null,
        issuedAt: i.issued_at,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => {
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      if (a.status === "active") return (a.expiresAt ?? "9999-12-31") < (b.expiresAt ?? "9999-12-31") ? -1 : 1;
      return a.issuedAt < b.issuedAt ? 1 : -1;
    });

  return NextResponse.json({ coupons });
}
