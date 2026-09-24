"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/auth-provider";
import { formatWon } from "../_components/crm-labels";

interface Order {
  id: number;
  member_id: number;
  member_name: string;
  product_name: string;
  product_type: string;
  list_price_won: number;
  coupon_discount_won: number;
  mileage_used: number;
  amount_won: number;
  status: string;
  channel: string;
  pg_method: string | null;
  pg_receipt_url: string | null;
  pg_approved_at: string | null;
  issued_kind: string | null;
  issued_id: number | null;
  fail_reason: string | null;
  refunded_at: string | null;
  refund_amount: number | null;
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "결제 대기",
  processing: "처리 중",
  paid: "결제 완료",
  failed: "결제 실패",
  canceled: "시간 초과",
  refunded: "환불됨",
};
const CHANNEL_LABEL: Record<string, string> = { web: "홈페이지", app: "회원앱" };

const TABS: { key: string; label: string }[] = [
  { key: "attention", label: "확인 필요" },
  { key: "", label: "전체" },
  { key: "paid", label: "결제 완료" },
  { key: "refunded", label: "환불" },
  { key: "pending", label: "결제 대기" },
];

function dt(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}.${String(k.getUTCMonth() + 1).padStart(2, "0")}.${String(
    k.getUTCDate()
  ).padStart(2, "0")} ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * 온라인 주문 — 홈페이지·회원앱에서 회원이 직접 결제한 건.
 * 직원이 발급하는 결제는 회원 상세에 남으므로 여기 오지 않는다.
 */
export default function CrmOrdersPage() {
  const { getIdToken } = useAuth();
  const [tab, setTab] = useState("attention");
  const [orders, setOrders] = useState<Order[]>([]);
  const [attention, setAttention] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch(`/api/crm/orders${tab ? `?status=${tab}` : ""}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setOrders(data.orders ?? []);
      setAttention(data.attentionCount ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, tab]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-7xl mx-auto">
      <header className="mb-4 rounded-2xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 px-4 py-4 md:px-5 md:py-5 shadow-sm">
        <p className="text-[12px] font-semibold text-[#7F6F55] dark:text-zinc-500">CRM</p>
        <h1 className="mt-1 text-[24px] md:text-[28px] leading-tight font-bold text-[#241F18] dark:text-zinc-100">
          온라인 주문
        </h1>
        <p className="mt-2 text-[12.5px] text-[#8C8270] dark:text-zinc-500 leading-relaxed">
          홈페이지·회원앱에서 회원이 직접 결제한 건입니다. 직원이 발급한 결제는 회원 상세에 남습니다.
        </p>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-[12.5px] font-semibold transition-colors ${
                tab === t.key
                  ? "bg-[#2F3A2B] text-white"
                  : "border border-[#D9CDB8] dark:border-zinc-700 text-[#3A342A] dark:text-zinc-300 hover:bg-[#F6F1E8] dark:hover:bg-zinc-800"
              }`}
            >
              {t.label}
              {t.key === "attention" && attention > 0 && (
                <span className="ml-1.5 inline-block min-w-[18px] rounded-full bg-red-600 px-1 text-[11px] text-white">
                  {attention}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      {error && <div className="mb-3 text-[12.5px] text-red-600">{error}</div>}

      {loading ? (
        <div className="px-4 py-8 text-center text-[12.5px] text-[#8C8270]">불러오는 중…</div>
      ) : orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#E4D9C6] dark:border-zinc-800 px-4 py-12 text-center text-[13px] text-[#8C8270] dark:text-zinc-500">
          {tab === "attention"
            ? "확인이 필요한 주문이 없어요."
            : "해당하는 주문이 없어요."}
        </div>
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => {
            const needsEye = (o.status === "paid" && !!o.fail_reason) || o.status === "refunded";
            return (
              <li
                key={o.id}
                className={`rounded-xl border px-4 py-3.5 bg-white/80 dark:bg-zinc-900 ${
                  needsEye
                    ? "border-red-300 dark:border-red-900/60"
                    : "border-[#E4D9C6] dark:border-zinc-800"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Link
                        href={`/crm/members/${o.member_id}`}
                        className="text-[14px] font-bold text-[#241F18] dark:text-zinc-100 hover:underline"
                      >
                        {o.member_name}
                      </Link>
                      <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-[#EEF4FB] dark:bg-zinc-800 text-[#3B6BA5] dark:text-[#8FB4DE]">
                        {CHANNEL_LABEL[o.channel] ?? o.channel}
                      </span>
                      <span className="text-[11.5px] text-[#A89B80]">{dt(o.created_at)}</span>
                    </div>
                    <p className="mt-1 text-[13.5px] text-[#3A342A] dark:text-zinc-200">
                      {o.product_name}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-[#A89B80] tabular-nums">
                      정가 {formatWon(o.list_price_won)}
                      {o.coupon_discount_won > 0 && ` · 쿠폰 -${formatWon(o.coupon_discount_won)}`}
                      {o.mileage_used > 0 && ` · 마일리지 -${o.mileage_used.toLocaleString()}P`}
                      {o.pg_method && ` · ${o.pg_method}`}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-[15px] font-bold text-[#241F18] dark:text-zinc-100 tabular-nums">
                      {formatWon(o.amount_won)}
                    </p>
                    <p
                      className={`mt-0.5 text-[11.5px] font-semibold ${
                        o.status === "paid"
                          ? "text-[#6B7B3A] dark:text-[#A8B87A]"
                          : o.status === "refunded"
                            ? "text-red-600 dark:text-red-400"
                            : "text-[#A89B80]"
                      }`}
                    >
                      {STATUS_LABEL[o.status] ?? o.status}
                    </p>
                    {o.pg_receipt_url && (
                      <a
                        href={o.pg_receipt_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-[11.5px] text-[#3B6BA5] dark:text-[#8FB4DE] underline"
                      >
                        영수증
                      </a>
                    )}
                  </div>
                </div>

                {/* 사람이 손대야 하는 경우만 빨간 안내 */}
                {o.status === "paid" && o.fail_reason && (
                  <p className="mt-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 px-3 py-2 text-[12px] leading-relaxed text-red-700 dark:text-red-400">
                    <b>결제는 완료됐지만 발급되지 않았습니다.</b> {o.fail_reason}
                    <br />
                    회원 상세에서 직접 발급하거나, 환불 처리해 주세요.
                  </p>
                )}
                {o.status === "refunded" && (
                  <p className="mt-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 px-3 py-2 text-[12px] leading-relaxed text-red-700 dark:text-red-400">
                    {dt(o.refunded_at)} 환불
                    {o.refund_amount ? ` (${formatWon(o.refund_amount)})` : ""}.
                    {o.issued_id
                      ? " 발급된 이용권은 자동으로 회수되지 않습니다. 회원 상세에서 확인해 주세요."
                      : ""}
                  </p>
                )}
                {o.status === "paid" && !o.fail_reason && o.issued_kind && (
                  <p className="mt-2 text-[11.5px] text-[#A89B80]">
                    발급 완료 · {o.issued_kind} #{o.issued_id}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
