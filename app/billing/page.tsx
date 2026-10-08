"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import EmailLoginPanel from "@/app/components/email-login-panel";
import { defaultPlan, won } from "@/app/lib/saas-plans";

/**
 * /billing — 센터 CRM 이용권 구매·구독 상태.
 *
 * 🚨 센터 등록은 사업자등록증 첨부가 필수라(`/api/crm/bootstrap` POST) **PG 심사원은
 *    센터를 만들 수 없다.** 심사용 테스트 계정은 센터가 이미 만들어진 상태로 준비해 둔다.
 *
 * 🚨 이 화면은 `/api/crm/centers/mine`(verifyAuth 기반)만 쓴다. `requireCrmContext` 를
 *    거치는 API 를 쓰면 이용권이 만료된 사장님이 **결제 화면에조차 못 들어온다**
 *    — 돈을 내려는 사람을 막는 게 가장 나쁜 실패다.
 */

interface CenterRow {
  centerId: number;
  centerName: string;
  centerKind: "solo" | "center";
  role: string;
  isSoloOwner: boolean;
  status: "active" | "pending";
  subscriptionBlocked?: boolean;
  subscriptionReason?: "no_subscription" | "expired" | null;
  subscriptionExpiresOn?: string | null;
}

const ymd = (s: string | null | undefined) => (s ? s.replace(/-/g, ".") : "");

export default function BillingPage() {
  const { user, loading, getIdToken } = useAuth();
  const [centers, setCenters] = useState<CenterRow[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const plan = defaultPlan();

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/centers/mine", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "센터 정보를 불러오지 못했어요");
        setCenters([]);
        return;
      }
      // 대표자(또는 개인 CRM 본인)인 센터만 — 결제할 수 있는 사람만 보여준다
      const mine = ((data.centers ?? []) as CenterRow[]).filter(
        (c) => c.status === "active" && (c.role === "owner" || c.isSoloOwner)
      );
      setCenters(mine);
    } catch {
      setError("네트워크 오류로 불러오지 못했어요");
      setCenters([]);
    }
  }, [getIdToken]);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, load]);

  async function buy(centerId: number) {
    if (busyId) return;
    setBusyId(centerId);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/saas/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ centerId, planCode: plan.code }),
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
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          {plan.name} · <b className="text-gray-900">{won(plan.priceWon)}</b> (부가세 포함).
          결제하시면 바로 사용하실 수 있어요.
        </p>
        <a href="/pricing" className="mt-2 inline-block text-[13px] font-semibold text-blue-600 underline">
          요금제·환불 규정 보기
        </a>
      </header>

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
              <p className="text-sm font-semibold text-gray-900">먼저 센터를 등록해주세요</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-gray-500">
                이용권은 센터 단위로 결제합니다. 센터를 등록하시면 이 화면에서 바로 결제하실 수
                있어요. 등록에는 사업자등록증 사본이 필요합니다.
              </p>
              <a
                href="/crm/onboarding"
                className="mt-4 inline-block rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white"
              >
                센터 등록하기
              </a>
            </div>
          )}

          {centers?.map((c) => {
            const live = !c.subscriptionBlocked && !!c.subscriptionExpiresOn;
            return (
              <section key={c.centerId} className="mt-5 rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{c.centerName || "센터"}</p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {c.centerKind === "solo" ? "개인 CRM" : "센터 CRM"}
                    </p>
                  </div>
                  <StatusChip
                    blocked={!!c.subscriptionBlocked}
                    reason={c.subscriptionReason}
                    expiresOn={c.subscriptionExpiresOn}
                  />
                </div>

                <p className="mt-3 text-[13px] leading-relaxed text-gray-600">
                  {c.subscriptionBlocked
                    ? c.subscriptionReason === "expired"
                      ? `${ymd(c.subscriptionExpiresOn)} 에 만료됐어요. 다시 결제하시면 그대로 이어서 사용하실 수 있습니다.`
                      : "아직 이용권이 없어요. 결제하시면 바로 사용하실 수 있습니다."
                    : live
                      ? `${ymd(c.subscriptionExpiresOn)} 까지 이용하실 수 있어요. 미리 결제하시면 남은 기간에 1개월이 더해집니다.`
                      : "지금은 무료로 이용 중이에요. 결제하시면 이용권이 시작됩니다."}
                </p>

                <button
                  type="button"
                  onClick={() => buy(c.centerId)}
                  disabled={busyId === c.centerId}
                  className="mt-4 w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white disabled:bg-gray-300"
                >
                  {busyId === c.centerId
                    ? "주문을 만드는 중…"
                    : `${won(plan.priceWon)} 결제하기`}
                </button>
              </section>
            );
          })}
        </>
      )}
    </main>
  );
}

function StatusChip({
  blocked,
  reason,
  expiresOn,
}: {
  blocked: boolean;
  reason?: "no_subscription" | "expired" | null;
  expiresOn?: string | null;
}) {
  const [label, cls] = blocked
    ? reason === "expired"
      ? ["만료", "bg-red-50 text-red-600"]
      : ["이용권 없음", "bg-gray-100 text-gray-500"]
    : expiresOn
      ? ["이용 중", "bg-blue-50 text-blue-600"]
      : ["무료 이용 중", "bg-emerald-50 text-emerald-700"];
  return (
    <span className={`shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}
