"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";

export interface ShopProduct {
  id: number;
  type: string;
  typeLabel: string;
  name: string;
  description: string | null;
  priceWon: number;
  totalSessions: number | null;
  sessionMinutes: number | null;
  durationValue: number | null;
  durationUnit: string | null;
  mileageEarn: number;
  billingMode: string;
  /** any(누구나) | new(신규만) | rejoin(재등록만) */
  eligibility: string;
}

interface Coupon {
  id: number;
  name: string;
  benefitType: string;
  status: string;
}

interface Quote {
  listPrice: number;
  couponDiscount: number;
  mileageUsed: number;
  amount: number;
  mileageEarn: number;
  mileageBalance: number;
  mileageMax: number;
  coupon: { issueId: number; name: string; benefit: string; discountWon: number } | null;
  couponError: string | null;
  free: boolean;
}

const UNIT_LABEL: Record<string, string> = { day: "일", week: "주", month: "개월", year: "년" };

function productSub(p: ShopProduct): string {
  const parts: string[] = [];
  if (p.totalSessions) parts.push(`${p.totalSessions}회`);
  if (p.sessionMinutes) parts.push(`회당 ${p.sessionMinutes}분`);
  if (p.durationValue && p.durationUnit) {
    parts.push(`${p.durationValue}${UNIT_LABEL[p.durationUnit] ?? p.durationUnit}`);
  }
  return parts.join(" · ");
}

export default function ShopClient(props: {
  centerId: number;
  centerName: string;
  products: ShopProduct[];
  salesEnabled: boolean;
}) {
  const { user, loading, signInWithGoogle, signInWithApple, getIdToken } = useAuth();
  const [picked, setPicked] = useState<ShopProduct | null>(null);
  const [regType, setRegType] = useState<string | null | undefined>(undefined);

  /**
   * 내 신규/재등록 구분을 받아, 살 수 없는 상품은 아예 보여주지 않는다.
   * 로그인 전에는 전부 보여준다 — 가격표 역할도 해야 하고 PG 심사원도 열어본다.
   * 🚨 화면에서 거르는 건 편의일 뿐, 실제 차단은 서버(quoteOrder)가 한다.
   */
  useEffect(() => {
    if (!user) {
      setRegType(undefined);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        const res = await fetch(`/api/crm/member-app/me?centerId=${props.centerId}`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!res.ok || !alive) return;
        const data = await res.json();
        setRegType(data?.member?.registrationType ?? null);
      } catch {
        /* 실패하면 전부 보여준다 — 서버가 어차피 막는다 */
      }
    })();
    return () => {
      alive = false;
    };
  }, [user, getIdToken, props.centerId]);

  const visible =
    regType === undefined
      ? props.products
      : props.products.filter((p) => {
          if (p.eligibility === "new") return regType !== "재등록";
          if (p.eligibility === "rejoin") return regType === "재등록";
          return true;
        });

  const grouped = visible.reduce<Record<string, ShopProduct[]>>((acc, p) => {
    (acc[p.typeLabel] ||= []).push(p);
    return acc;
  }, {});

  if (visible.length === 0) {
    return (
      <p className="mt-6 rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm leading-relaxed text-gray-500">
        {regType !== undefined && props.products.length > 0
          ? "회원님이 지금 온라인으로 구매할 수 있는 상품이 없어요. 센터로 문의해주세요."
          : "지금 온라인으로 구매할 수 있는 상품이 없어요."}
      </p>
    );
  }

  return (
    <>
      {!!regType && (
        <p className="mt-5 rounded-lg bg-gray-50 px-3.5 py-2.5 text-xs text-gray-600">
          {regType} 회원 기준 가격으로 보여드리고 있어요.
        </p>
      )}

      <div className="mt-6 space-y-6">
        {Object.entries(grouped).map(([label, list]) => (
          <section key={label}>
            <h2 className="mb-2 text-sm font-bold text-gray-900">{label}</h2>
            <ul className="space-y-2">
              {list.map((p) => {
                const sub = productSub(p);
                return (
                  <li
                    key={p.id}
                    className="rounded-xl border border-gray-200 p-4 transition-colors hover:border-gray-300"
                  >
                    <p className="font-semibold text-gray-900">{p.name}</p>
                    {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
                    {p.description && (
                      <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-gray-500">
                        {p.description}
                      </p>
                    )}
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-gray-900">
                          {p.priceWon.toLocaleString()}원
                        </p>
                        {p.mileageEarn > 0 && (
                          <p className="text-xs text-blue-600">
                            {p.mileageEarn.toLocaleString()}P 적립
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={!props.salesEnabled}
                        onClick={() => setPicked(p)}
                        className="shrink-0 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:bg-gray-300"
                      >
                        구매하기
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {picked && (
        <CheckoutSheet
          product={picked}
          centerId={props.centerId}
          onClose={() => setPicked(null)}
          auth={{ user, loading, signInWithGoogle, signInWithApple, getIdToken }}
        />
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   결제 시트 — 쿠폰·마일리지를 고르고 최종 금액을 확인한다.
   🚨 금액은 언제나 서버(quote)가 계산한 값을 그대로 보여준다.
      여기서 더하거나 빼는 계산을 하면 화면과 실제 결제액이 어긋난다.
   ───────────────────────────────────────────────────────── */
function CheckoutSheet(props: {
  product: ShopProduct;
  centerId: number;
  onClose: () => void;
  auth: {
    user: { uid: string } | null;
    loading: boolean;
    signInWithGoogle: () => Promise<void>;
    signInWithApple: () => Promise<void>;
    getIdToken: () => Promise<string | null>;
  };
}) {
  const { product, centerId, onClose, auth } = props;
  const [quote, setQuote] = useState<Quote | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponId, setCouponId] = useState<number | null>(null);
  const [mileageInput, setMileageInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const loadQuote = useCallback(
    async (coupon: number | null, mileage: number) => {
      setError(null);
      const token = await auth.getIdToken();
      if (!token) return;
      const res = await fetch("/api/crm/member-app/orders/quote", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          centerId,
          productId: product.id,
          couponIssueId: coupon,
          mileageUse: mileage,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 로그인은 됐지만 이 센터 회원이 아닌 경우 등 — 구매 자체가 막히는 상황
        if (res.status === 403 || res.status === 503) setBlocked(data?.error ?? "구매할 수 없어요");
        else setError(data?.error ?? "금액을 계산하지 못했어요");
        return;
      }
      setQuote(data as Quote);
      if ((data as Quote).couponError) setError((data as Quote).couponError);
    },
    [auth, centerId, product.id]
  );

  // 로그인 상태가 되면 견적 + 보유 쿠폰을 불러온다
  useEffect(() => {
    if (!auth.user) return;
    (async () => {
      await loadQuote(null, 0);
      const token = await auth.getIdToken();
      if (!token) return;
      const res = await fetch(`/api/crm/member-app/coupons?centerId=${centerId}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCoupons(((data.coupons ?? []) as Coupon[]).filter((c) => c.status === "active"));
      }
    })();
  }, [auth.user, auth, centerId, loadQuote]);

  const applyCoupon = async (id: number | null) => {
    setCouponId(id);
    await loadQuote(id, Number(mileageInput) || 0);
  };

  const applyMileage = async (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, "");
    setMileageInput(digits);
    await loadQuote(couponId, Number(digits) || 0);
  };

  const submit = async () => {
    if (!quote || paying) return;
    setPaying(true);
    setError(null);
    try {
      const token = await auth.getIdToken();
      const res = await fetch("/api/crm/member-app/orders", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          centerId,
          productId: product.id,
          couponIssueId: couponId,
          mileageUse: Number(mileageInput) || 0,
          channel: "web",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "주문을 만들지 못했어요");
        setPaying(false);
        return;
      }
      // 0원 주문은 PG 를 거치지 않고 이미 발급까지 끝났다
      if (data.free) {
        window.location.href = `/shop/done?free=1&name=${encodeURIComponent(product.name)}`;
        return;
      }
      window.location.href = data.payUrl;
    } catch {
      setError("네트워크 오류가 발생했어요");
      setPaying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white px-5 pb-8 pt-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-gray-500">{product.typeLabel}</p>
            <p className="mt-0.5 font-bold text-gray-900">{product.name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-gray-400">
            닫기
          </button>
        </div>

        {/* 로그인 전 */}
        {!auth.user && !auth.loading && (
          <div className="mt-6">
            <p className="text-sm leading-relaxed text-gray-600">
              구매하려면 로그인이 필요해요. 센터에 등록된 회원 계정으로 로그인해주세요.
            </p>
            <button
              type="button"
              onClick={() => auth.signInWithGoogle()}
              className="mt-4 w-full rounded-xl border border-gray-300 py-3.5 text-sm font-bold text-gray-800"
            >
              구글로 로그인
            </button>
            <button
              type="button"
              onClick={() => auth.signInWithApple()}
              className="mt-2 w-full rounded-xl bg-black py-3.5 text-sm font-bold text-white"
            >
              Apple 로 로그인
            </button>
          </div>
        )}

        {/* 구매 자체가 막힌 상황 */}
        {blocked && (
          <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">
            {blocked}
          </p>
        )}

        {/* 로그인 후 — 쿠폰·마일리지·금액 */}
        {!!auth.user && !blocked && (
          <div className="mt-5">
            {coupons.length > 0 && (
              <div className="mb-4">
                <p className="mb-1.5 text-xs font-semibold text-gray-700">쿠폰</p>
                <select
                  value={couponId ?? ""}
                  onChange={(e) => applyCoupon(e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                >
                  <option value="">사용 안 함</option>
                  {coupons.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {quote && quote.mileageMax > 0 && (
              <div className="mb-4">
                <div className="mb-1.5 flex items-baseline justify-between">
                  <p className="text-xs font-semibold text-gray-700">마일리지</p>
                  <p className="text-xs text-gray-500">
                    보유 {quote.mileageBalance.toLocaleString()}P · 최대{" "}
                    {quote.mileageMax.toLocaleString()}P
                  </p>
                </div>
                <div className="flex gap-2">
                  <input
                    value={mileageInput}
                    onChange={(e) => applyMileage(e.target.value)}
                    inputMode="numeric"
                    placeholder="0"
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => applyMileage(String(quote.mileageMax))}
                    className="shrink-0 rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-700"
                  >
                    전액
                  </button>
                </div>
              </div>
            )}

            {quote && (
              <dl className="space-y-1.5 border-t border-gray-200 pt-4 text-sm">
                <Row label="상품 금액" value={`${quote.listPrice.toLocaleString()}원`} />
                {quote.couponDiscount > 0 && (
                  <Row
                    label="쿠폰 할인"
                    value={`-${quote.couponDiscount.toLocaleString()}원`}
                    accent
                  />
                )}
                {quote.mileageUsed > 0 && (
                  <Row
                    label="마일리지 사용"
                    value={`-${quote.mileageUsed.toLocaleString()}원`}
                    accent
                  />
                )}
                <div className="!mt-3 flex items-center justify-between border-t border-gray-200 pt-3">
                  <dt className="font-semibold text-gray-900">최종 결제 금액</dt>
                  <dd className="text-lg font-bold text-gray-900">
                    {quote.amount.toLocaleString()}원
                  </dd>
                </div>
                {quote.mileageEarn > 0 && (
                  <p className="!mt-2 text-xs text-gray-500">
                    결제 완료 시 {quote.mileageEarn.toLocaleString()}P 적립
                  </p>
                )}
              </dl>
            )}

            {error && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={!quote || paying}
              className="mt-5 w-full rounded-xl bg-blue-600 py-4 text-base font-bold text-white disabled:bg-gray-300"
            >
              {paying
                ? "주문을 만드는 중…"
                : quote?.free
                  ? "무료로 받기"
                  : quote
                    ? `${quote.amount.toLocaleString()}원 결제하기`
                    : "금액 확인 중…"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className={accent ? "text-blue-600" : "text-gray-900"}>{value}</dd>
    </div>
  );
}
