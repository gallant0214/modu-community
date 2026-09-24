"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
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
  /** 단독 구매 불가 — 이용권에 곁들여 담는 상품(운동복) */
  addon: boolean;
}

interface Coupon {
  id: number;
  name: string;
  benefitType: string;
  status: string;
}

interface QuoteLine {
  productId: number;
  name: string;
  typeLabel: string;
  listPriceWon: number;
  couponDiscountWon: number;
  mileageUsedWon: number;
  amountWon: number;
}

interface Quote {
  lines: QuoteLine[];
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
  const searchParams = useSearchParams();
  const [picked, setPicked] = useState<ShopProduct | null>(null);

  // 상품 지정 링크(?product=<id>) — 해당 상품 결제 시트를 바로 연다 (최초 1회)
  useEffect(() => {
    const pid = Number(searchParams.get("product"));
    if (!pid) return;
    const p = props.products.find((x) => x.id === pid && !x.addon);
    if (p) setPicked(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /** 함께 담은 곁들임 상품(운동복) — 이용권을 고를 때 같이 결제된다 */
  const [addons, setAddons] = useState<number[]>([]);
  const [regType, setRegType] = useState<string | null | undefined>(undefined);

  /**
   * 내 신규/재등록 구분을 받아, 살 수 없는 상품은 아예 보여주지 않는다.
   * 로그인 전에는 전부 보여준다 — 가격표 역할도 해야 하고 PG 심사원도 열어본다.
   * 🚨 화면에서 거르는 건 편의일 뿐, 실제 차단은 서버(quoteCart)가 한다.
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

  /**
   * 신규 / 재등록 탭.
   * 둘 다 보여주는 게 맞다 — 숨기면 가격표 구실을 못 하고, 비로그인 방문자에게도
   * 보여야 한다. 대신 내가 살 수 없는 쪽은 구매 버튼을 잠그고 이유를 적는다.
   * (결제 단계에서 에러가 나는 것보다, 누르기 전에 알려주는 게 낫다)
   */
  const hasNew = props.products.some((p) => !p.addon && p.eligibility === "new");
  const hasRejoin = props.products.some((p) => !p.addon && p.eligibility === "rejoin");
  const showTabs = hasNew && hasRejoin;
  const myTab: "new" | "rejoin" = regType === "재등록" ? "rejoin" : "new";
  const [tab, setTab] = useState<"new" | "rejoin">(myTab);

  // 로그인해서 내 구분을 알게 되면 내 탭으로 맞춰준다
  useEffect(() => {
    if (regType !== undefined) setTab(regType === "재등록" ? "rejoin" : "new");
  }, [regType]);

  /** 이 상품을 지금 살 수 있는가 — 서버 판정과 같은 규칙 */
  const buyable = (p: ShopProduct): boolean => {
    if (regType === undefined) return true; // 로그인 전에는 잠그지 않는다
    if (p.eligibility === "new") return regType !== "재등록";
    if (p.eligibility === "rejoin") return regType === "재등록";
    return true;
  };

  // 탭은 고른 조건의 상품만 보여준다 (재등록 탭 = 재등록 상품만)
  const passes = props.products.filter((p) => !p.addon);
  const addonProducts = props.products.filter((p) => p.addon);
  const visible = showTabs ? passes.filter((p) => p.eligibility === tab) : passes;
  // 신규·재등록 구분이 없는 이용권은 탭과 무관하게 항상 보여준다 (탭에서 사라지면 안 된다)
  const common = showTabs ? passes.filter((p) => p.eligibility === "any") : [];

  const grouped = visible.reduce<Record<string, ShopProduct[]>>((acc, p) => {
    (acc[p.typeLabel] ||= []).push(p);
    return acc;
  }, {});
  const groupedCommon = common.reduce<Record<string, ShopProduct[]>>((acc, p) => {
    (acc[p.typeLabel] ||= []).push(p);
    return acc;
  }, {});

  if (props.products.length === 0) {
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
      {showTabs && (
        <div className="mt-6">
          <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
            {([
              ["new", "신규 등록"],
              ["rejoin", "재등록"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex-1 rounded-lg py-2.5 text-sm font-bold transition-colors ${
                  tab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                }`}
              >
                {label}
                {!!regType && myTab === key && (
                  <span className="ml-1 text-[11px] font-semibold text-blue-600">내 조건</span>
                )}
              </button>
            ))}
          </div>

          {!regType ? (
            <p className="mt-2.5 text-xs leading-relaxed text-gray-500">
              처음 등록하시면 <b>신규 등록</b>, 이용하신 적이 있으면 <b>재등록</b> 가격입니다.
              로그인하시면 회원님께 맞는 가격이 자동으로 선택됩니다.
            </p>
          ) : tab !== myTab ? (
            <p className="mt-2.5 rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
              회원님은 <b>{regType}</b> 조건이라 이 탭의 상품은 구매하실 수 없어요.
              {myTab === "new" ? " 신규 등록" : " 재등록"} 탭에서 선택해주세요.
            </p>
          ) : (
            <p className="mt-2.5 text-xs text-gray-500">
              {regType} 회원 기준 가격으로 보여드리고 있어요.
            </p>
          )}
        </div>
      )}

      <div className="mt-6 space-y-6">
        {renderGroups(grouped)}
        {Object.keys(groupedCommon).length > 0 && renderGroups(groupedCommon)}
      </div>

      {picked && (
        <CheckoutSheet
          product={picked}
          addonProducts={addonProducts}
          addons={addons}
          onToggleAddon={(id: number) =>
            setAddons((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
          }
          centerId={props.centerId}
          onClose={() => {
            setPicked(null);
            setAddons([]);
          }}
          auth={{ user, loading, signInWithGoogle, signInWithApple, getIdToken }}
        />
      )}
    </>
  );

  function renderGroups(groups: Record<string, ShopProduct[]>) {
    return Object.entries(groups).map(([label, list]) => (
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
                        disabled={!props.salesEnabled || !buyable(p)}
                        onClick={() => setPicked(p)}
                        title={
                          !buyable(p)
                            ? `${regType} 회원은 구매하실 수 없는 상품이에요`
                            : undefined
                        }
                        className="shrink-0 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:bg-gray-300"
                      >
                        {buyable(p) ? "구매하기" : "구매 불가"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
    ));
  }
}

/* ─────────────────────────────────────────────────────────
   결제 시트 — 쿠폰·마일리지를 고르고 최종 금액을 확인한다.
   🚨 금액은 언제나 서버(quote)가 계산한 값을 그대로 보여준다.
      여기서 더하거나 빼는 계산을 하면 화면과 실제 결제액이 어긋난다.
   ───────────────────────────────────────────────────────── */
function CheckoutSheet(props: {
  product: ShopProduct;
  /** 곁들여 담을 수 있는 상품(운동복) */
  addonProducts: ShopProduct[];
  addons: number[];
  onToggleAddon: (id: number) => void;
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
  /** 서버에 보낼 장바구니 — 고른 이용권 + 곁들임. 순서가 곧 표시 순서다 */
  const productIds = [product.id, ...props.addons];
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
          productIds,
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
    // 담은 항목이 바뀌면 다시 계산해야 한다
    [auth, centerId, productIds.join(",")]
  );

  // 담은 항목이 바뀌면 금액을 다시 받는다
  useEffect(() => {
    if (!auth.user) return;
    loadQuote(couponId, Number(mileageInput) || 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.addons.join(",")]);

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
          productIds,
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

        {/* 로그인 후 — 곁들임·쿠폰·마일리지·금액 */}
        {!!auth.user && !blocked && (
          <div className="mt-5">
            {props.addonProducts.length > 0 && (
              <div className="mb-4">
                <p className="mb-1.5 text-xs font-semibold text-gray-700">
                  함께 담기 <span className="font-normal text-gray-400">(선택)</span>
                </p>
                <div className="space-y-1.5">
                  {props.addonProducts.map((a) => {
                    const on = props.addons.includes(a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => props.onToggleAddon(a.id)}
                        className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                          on ? "border-blue-500 bg-blue-50/60" : "border-gray-200"
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${
                            on ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300"
                          }`}
                        >
                          {on ? "✓" : ""}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{a.name}</span>
                        <span className="shrink-0 text-sm font-semibold text-gray-900">
                          {a.priceWon > 0 ? `${a.priceWon.toLocaleString()}원` : "무료"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

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
                {/* 묶음이면 무엇이 얼마인지 항목별로 보여준다 — 합계만 보이면 확인이 안 된다 */}
                {quote.lines.length > 1 &&
                  quote.lines.map((l) => (
                    <div key={l.productId} className="flex items-center justify-between">
                      <dt className="min-w-0 truncate text-gray-500">
                        <span className="mr-1 text-[11px] text-gray-400">{l.typeLabel}</span>
                        {l.name}
                      </dt>
                      <dd className="shrink-0 text-gray-900">
                        {l.listPriceWon.toLocaleString()}원
                      </dd>
                    </div>
                  ))}
                <Row
                  label={quote.lines.length > 1 ? "상품 금액 합계" : "상품 금액"}
                  value={`${quote.listPrice.toLocaleString()}원`}
                />
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
