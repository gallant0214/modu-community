"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { computeCouponDiscount, type CouponDef } from "@/app/lib/crm-coupons";

export interface AppliedCoupon {
  issueId: number;
  label: string;
  discountWon: number;
}

interface MemberCoupon {
  issueId: number;
  code: string;
  status: string;
  expiresAt: string | null;
  name: string;
  benefit: string;
  condition: string;
  coupon: CouponDef;
}

/**
 * 발급창용 쿠폰 선택.
 * 회원이 가진 '사용 가능' 쿠폰을 보여주고, 지금 고른 상품·정가 기준 할인액을 미리 계산한다.
 * 적용하면 부모가 할인 금액 칸을 그 값으로 채운다. 최종 판정·사용 처리는 서버(발급 라우트)가 한다.
 */
export function CouponPicker({
  memberId,
  priceWon,
  productType,
  productId,
  applied,
  onApply,
  excludeIssueIds = [],
}: {
  memberId: number;
  /** 쿠폰 적용 전 정가 */
  priceWon: number;
  productType: string | null;
  productId: number | null;
  applied: AppliedCoupon | null;
  onApply: (c: AppliedCoupon | null) => void;
  /** 장바구니 다른 줄에 이미 붙인 쿠폰 (한 장을 두 번 못 쓰게) */
  excludeIssueIds?: (number | undefined)[];
}) {
  const { getIdToken } = useAuth();
  const [coupons, setCoupons] = useState<MemberCoupon[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch(`/api/crm/coupons/member/${memberId}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const d = await res.json();
        if (!cancelled) setCoupons(res.ok ? ((d.coupons as MemberCoupon[]) ?? []) : []);
      } catch {
        if (!cancelled) setCoupons([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getIdToken, memberId]);

  if (!coupons) return null;
  const usable = coupons.filter((c) => c.status === "issued" && !excludeIssueIds.includes(c.issueId));
  if (usable.length === 0 && !applied) return null; // 쓸 쿠폰이 없으면 자리 차지 안 함

  const target = { priceWon, productType, productId };
  const appliedCoupon = applied ? coupons.find((c) => c.issueId === applied.issueId) : null;
  // 상품·금액을 바꾼 뒤 할인액이 달라졌으면 알려준다 (자동으로 바꾸지 않음 — 직원이 확인하고 다시 적용)
  const recheck = appliedCoupon ? computeCouponDiscount(appliedCoupon.coupon, target) : null;
  const stale = !!applied && !!recheck && (!recheck.ok || recheck.discountWon !== applied.discountWon);

  return (
    <div className="rounded-xl border border-dashed border-[#6B7B3A]/50 bg-[#6B7B3A]/[0.04] px-3 py-2.5">
      {applied ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-semibold text-[#4d5a29] dark:text-[#C3D19A]">🎟 {applied.label}</span>
          <span className="text-[12.5px] font-bold text-[#2A251D] dark:text-zinc-100">-{applied.discountWon.toLocaleString()}원</span>
          <button type="button" onClick={() => onApply(null)} className="ml-auto text-[12px] text-[#8C8270] underline">
            쿠폰 해제
          </button>
          {stale && (
            <div className="w-full text-[11.5px] text-[#B47B2A]">
              {recheck && recheck.ok ? (
                <>
                  상품·금액이 바뀌어 할인액이 {recheck.discountWon.toLocaleString()}원이 됐어요.{" "}
                  <button
                    type="button"
                    className="underline font-semibold"
                    onClick={() => onApply({ ...applied, discountWon: recheck.discountWon })}
                  >
                    다시 적용
                  </button>
                </>
              ) : (
                <>{recheck?.reason ?? "지금 상품에는 이 쿠폰을 쓸 수 없어요."} 쿠폰을 해제해 주세요.</>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-full flex items-center gap-2 text-left"
          >
            <span className="text-[12.5px] font-semibold text-[#4d5a29] dark:text-[#C3D19A]">
              🎟 보유 쿠폰 {usable.length}장
            </span>
            <span className="text-[11.5px] text-[#8C8270]">— 눌러서 적용</span>
            <span className="ml-auto text-[#8C8270] text-[12px]">{open ? "▲" : "▼"}</span>
          </button>
          {open && (
            <ul className="mt-2 space-y-1.5">
              {usable.map((c) => {
                const chk = computeCouponDiscount(c.coupon, target);
                return (
                  <li key={c.issueId}>
                    <button
                      type="button"
                      disabled={!chk.ok}
                      onClick={() => {
                        onApply({ issueId: c.issueId, label: c.name, discountWon: chk.discountWon });
                        setOpen(false);
                      }}
                      className="w-full text-left rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 enabled:hover:border-[#6B7B3A] disabled:opacity-55 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="text-[13px] font-semibold text-[#2A251D] dark:text-zinc-100">{c.name}</span>
                        <span className="text-[12px] text-[#4d5a29] dark:text-[#A8B87A]">{c.benefit}</span>
                        {chk.ok && (
                          <span className="ml-auto text-[12.5px] font-bold text-[#2A251D] dark:text-zinc-100">
                            -{chk.discountWon.toLocaleString()}원
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#8C8270]">
                        {chk.ok
                          ? [c.condition, c.expiresAt ? `${c.expiresAt.replace(/-/g, ".")}까지` : ""].filter(Boolean).join(" · ")
                          : chk.reason}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
