"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import EmailLoginPanel from "@/app/components/email-login-panel";
import { visiblePlans, defaultPlan, monthlyWon, listPriceWon, won } from "@/app/lib/saas-plans";

/**
 * /billing — 센터 CRM 이용권 구매·구독 상태.
 *
 * 🚨 센터 등록은 사업자등록증 첨부가 필수라(`/api/crm/bootstrap` POST) **PG 심사원은
 *    센터를 만들 수 없다.** 심사용 테스트 계정은 센터가 이미 만들어진 상태로 준비해 둔다.
 *
 * 🚨 이 화면은 `/api/crm/centers/mine`(verifyAuth 기반)만 쓴다. `requireCrmContext` 를
 *    거치는 API 를 쓰면 이용권이 만료된 사장님이 **결제 화면에조차 못 들어온다**
 *    — 돈을 내려는 사람을 막는 게 가장 나쁜 실패다.
 *
 * 🚨 요금제는 `visiblePlans()` 가 주는 것만 보여준다. 기간이 다를 뿐 기능은 같으므로
 *    고른 요금제의 `code` 를 주문에 그대로 실어 보내고, **금액은 서버가 다시 조회한다**
 *    — 화면에서 보낸 금액을 믿으면 그 순간 위변조 경로가 열린다.
 *
 * 🚨 구독 상태는 `/api/saas/subscriptions` 로 **따로** 가져온다.
 *    접근 판정(crmAccessState)은 구독 강제가 꺼져 있으면 구독이 없어도 "허용" 을
 *    돌려주는데, 그걸 그대로 쓰면 결제 화면에 "무료 이용 중" 이 뜬다.
 *    유료 상품 페이지에서 그 문구는 PG 심사원에게 '0원 상품' 으로 읽힌다.
 */

interface CenterRow {
  centerId: number;
  centerName: string;
  centerKind: "solo" | "center";
  role: string;
  isSoloOwner: boolean;
  status: "active" | "pending";
}

interface SubRow {
  centerId: number;
  startedOn: string;
  expiresOn: string;
  live: boolean;
}

const ymd = (s: string | null | undefined) => (s ? s.replace(/-/g, ".") : "");

export default function BillingPage() {
  const { user, loading, getIdToken } = useAuth();
  const [centers, setCenters] = useState<CenterRow[] | null>(null);
  const [subs, setSubs] = useState<Record<number, SubRow>>({});
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const plans = visiblePlans();
  const [planCode, setPlanCode] = useState(defaultPlan().code);
  const plan = plans.find((p) => p.code === planCode) ?? defaultPlan();

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      const headers = { authorization: `Bearer ${token}` };
      const [cRes, sRes] = await Promise.all([
        fetch("/api/crm/centers/mine", { headers, cache: "no-store" }),
        fetch("/api/saas/subscriptions", { headers, cache: "no-store" }),
      ]);
      const cData = await cRes.json();
      if (!cRes.ok) {
        setError(cData?.error || "센터 정보를 불러오지 못했어요");
        setCenters([]);
        return;
      }
      // 대표자(또는 개인 CRM 본인)인 센터만 — 결제할 수 있는 사람만 보여준다
      setCenters(
        ((cData.centers ?? []) as CenterRow[]).filter(
          (c) => c.status === "active" && (c.role === "owner" || c.isSoloOwner)
        )
      );
      if (sRes.ok) {
        const sData = await sRes.json();
        const map: Record<number, SubRow> = {};
        for (const s of (sData.subscriptions ?? []) as SubRow[]) map[s.centerId] = s;
        setSubs(map);
      }
    } catch {
      setError("네트워크 오류로 불러오지 못했어요");
      setCenters([]);
    }
  }, [getIdToken]);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, load]);

  /* 회원가입만 하고 들어온 사람은 결제할 센터가 없다 → **센터 선택창**(온보딩 첫 화면,
     '개인 강사 / 센터 선택하기')으로 바로 보낸다. 거기서 등록을 마치면 returnTo 로
     이 결제 화면에 돌아온다.

     🚨 한 번만 보낸다. 센터 등록을 중간에 그만두고 돌아온 사람을 매번 다시 밀어내면
        결제 화면을 아예 볼 수 없게 된다.
     🚨 조회에 **성공해서** 0개인 경우만이다 — 네트워크 오류로 비어 있는 것과 구분하지
        않으면 에러를 삼키고 엉뚱한 화면으로 보낸다. */
  const sentToOnboarding = useRef(false);
  useEffect(() => {
    if (!user || error || centers === null) return;
    if (centers.length > 0 || sentToOnboarding.current) return;
    sentToOnboarding.current = true;
    goOnboarding();
  }, [user, error, centers]);

  /* 센터 등록을 마치면 **이 화면으로 돌아오게** 한다 — ?pg= 같은 쿼리까지 그대로 들고 간다.
     결제하러 들어온 사람을 대시보드에 떨어뜨리면 흐름이 끊긴다. */
  function goOnboarding() {
    const back = window.location.pathname + window.location.search;
    window.location.href = `/crm/onboarding?returnTo=${encodeURIComponent(back)}`;
  }

  async function buy(centerId: number) {
    if (busyId) return;
    setBusyId(centerId);
    setError("");
    try {
      const token = await getIdToken();
      /* 주소에 ?pg=portone 이 붙어 있으면 그 PG 로 주문을 만든다.
         🚨 서버가 **심사용 계정에만** 적용한다(일반 고객이 붙여도 무시).
            토스·이니시스 동시 심사용 장치다.
         useSearchParams 대신 window 에서 읽는다 — 이 페이지를 정적으로 유지하려고. */
      const pg = new URLSearchParams(window.location.search).get("pg") || undefined;
      const res = await fetch("/api/saas/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ centerId, planCode: plan.code, pgProvider: pg }),
      });
      const data = await res.json();
      if (!res.ok || !data?.payUrl) {
        setError(data?.error || "주문을 만들지 못했어요");
        setBusyId(null);
        return;
      }
      window.location.href = data.payUrl;
    } catch {
      setError("네트워크 오류로 주문을 만들지 못했어요");
      setBusyId(null);
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg bg-white px-5 pb-16 pt-8">
      <header>
        <p className="text-xs font-semibold text-blue-600">센터 CRM 이용권</p>
        <h1 className="mt-1 text-xl font-bold text-gray-900">이용권 결제</h1>
      </header>

      {/* 기간 선택 — 기능은 모두 같고 길수록 월 단가가 내려간다 */}
      <section className="mt-5">
        <p className="text-[13px] font-semibold text-gray-700">이용 기간을 고르세요</p>
        <div className="mt-2 space-y-2">
          {plans.map((p) => {
            const on = p.code === plan.code;
            return (
              <button
                key={p.code}
                type="button"
                onClick={() => setPlanCode(p.code)}
                aria-pressed={on}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left ${
                  on ? "border-blue-600 bg-blue-50/60" : "border-gray-200 bg-white"
                }`}
              >
                <span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-[15px] font-bold text-gray-900">{p.periodMonths}개월</span>
                    {p.discountPercent > 0 && (
                      <span className="rounded-md bg-blue-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
                        {p.discountPercent}% 할인
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] text-gray-500">
                    월 {won(monthlyWon(p))} 꼴
                    {p.discountPercent > 0 ? ` · 1개월권 ${p.periodMonths}회 결제 시 ${won(listPriceWon(p))}` : ""}
                  </span>
                </span>
                <span className={`shrink-0 text-[15px] font-bold ${on ? "text-blue-700" : "text-gray-900"}`}>
                  {won(p.priceWon)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 결제 페이지(/billing/pay)와 같은 상품 요약 — 구매자가 무엇을 얼마에 사는지
          결제창에 들어가기 전에 똑같이 보이게 한다 */}
      <section className="mt-4 rounded-xl border border-gray-200 p-4">
        <p className="font-semibold text-gray-900">{plan.name}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-gray-500">{plan.summary}</p>
        <dl className="mt-3 space-y-1.5 text-sm">
          <Line label="이용 기간" value={`${plan.periodMonths}개월`} />
          <Line label="서비스 제공시기" value="결제 완료 즉시" />
          <Line label="자동 결제" value="없음 (약정·해지 위약금 없음)" />
          <div className="!mt-3 flex items-center justify-between border-t border-gray-200 pt-3">
            <dt className="font-semibold text-gray-900">결제 금액</dt>
            <dd className="text-lg font-bold text-gray-900">
              {won(plan.priceWon)}{" "}
              <span className="text-xs font-normal text-gray-400">(부가세 포함)</span>
            </dd>
          </div>
        </dl>
        <a
          href="/pricing/policy"
          className="mt-3 inline-block text-[13px] font-semibold text-blue-600 underline"
        >
          서비스 제공기간 · 취소 · 환불 규정 보기
        </a>
      </section>

      {loading && <p className="mt-8 text-sm text-gray-400">불러오는 중…</p>}

      {!loading && !user && (
        <EmailLoginPanel intro="이용권을 결제하려면 로그인이 필요해요. 모두의지도사 계정으로 로그인해주세요." />
      )}

      {!loading && user && (
        <>
          {error && (
            <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700">
              {error}
            </p>
          )}

          {centers === null && <p className="mt-8 text-sm text-gray-400">센터 정보를 확인하는 중…</p>}

          {centers !== null && centers.length === 0 && (
            <div className="mt-6 rounded-xl border border-gray-200 px-4 py-5">
              <p className="text-sm font-semibold text-gray-900">먼저 센터를 선택해주세요</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-gray-500">
                이용권은 센터 단위로 결제합니다. 센터를 등록하시면 이 화면으로 돌아와 바로
                결제하실 수 있어요. 개인 강사는 사업자등록증 없이 등록되고, 센터(사업장)로
                등록하실 때만 사업자등록증 사본이 필요합니다.
              </p>
              <button
                type="button"
                onClick={goOnboarding}
                className="mt-4 inline-block rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white"
              >
                센터 등록하기
              </button>
            </div>
          )}

          {centers && centers.length > 0 && (
            <p className="mt-7 text-[13px] font-semibold text-gray-700">결제할 센터를 선택하세요</p>
          )}

          {centers?.map((c) => {
            const sub = subs[c.centerId];
            return (
              <section key={c.centerId} className="mt-3 rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{c.centerName || "센터"}</p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {c.centerKind === "solo" ? "개인 CRM" : "센터 CRM"}
                    </p>
                  </div>
                  <StatusChip sub={sub} />
                </div>

                <p className="mt-3 text-[13px] leading-relaxed text-gray-600">
                  {!sub
                    ? "아직 이용권이 없습니다. 결제하시면 바로 사용하실 수 있어요."
                    : sub.live
                      ? `${ymd(sub.expiresOn)} 까지 이용하실 수 있어요. 미리 결제하시면 남은 기간에 ${plan.periodMonths}개월이 더해집니다.`
                      : `${ymd(sub.expiresOn)} 에 만료됐습니다. 다시 결제하시면 그대로 이어서 사용하실 수 있어요.`}
                </p>

                <button
                  type="button"
                  onClick={() => buy(c.centerId)}
                  disabled={busyId === c.centerId}
                  className="mt-4 w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white disabled:bg-gray-300"
                >
                  {busyId === c.centerId ? "주문을 만드는 중…" : `${won(plan.priceWon)} 결제하기`}
                </button>
              </section>
            );
          })}
        </>
      )}
    </main>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-900">{value}</dd>
    </div>
  );
}

/**
 * 구독 상태 칩.
 * 🚨 "무료 이용 중" 같은 문구를 두지 않는다 — 유료 상품 결제 화면에서
 *    PG 심사원에게 '0원 상품' 으로 읽힌다. 상태는 셋뿐이다.
 */
function StatusChip({ sub }: { sub?: SubRow }) {
  const [label, cls] = !sub
    ? ["이용권 없음", "bg-gray-100 text-gray-500"]
    : sub.live
      ? ["이용 중", "bg-blue-50 text-blue-600"]
      : ["만료", "bg-red-50 text-red-600"];
  return (
    <span className={`shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}
