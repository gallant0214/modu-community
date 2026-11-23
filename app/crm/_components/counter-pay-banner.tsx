"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { CrmModal } from "./crm-modal";
import { formatPhone } from "./crm-labels";

/**
 * '이용권 결제 요청' 배너 — 대시보드·회원관리·출석현황 맨 위.
 *
 * PG 가 연결되지 않은 센터(범어점 외)는 회원이 앱·홈페이지에서 상품을 고르면
 * '카운터 결제 요청'으로 접수된다. 직원이 카운터에서 결제를 받고 [결제완료 후 승인] 하면
 * 그때 이용권이 발급된다. 승인하거나 요청을 취소할 때까지 계속 떠 있다.
 * 권한(sales.counter_confirm)이 없는 직원에게는 서버가 빈 목록을 줘서 보이지 않는다.
 */
interface Item {
  orderId: number;
  memberId: number;
  memberName: string;
  memberPhone: string | null;
  productName: string;
  listPriceWon: number;
  couponDiscountWon: number;
  mileageUsed: number;
  amountWon: number;
  requestedAt: string | null;
}

const PAY_OPTIONS = [
  { key: "card", label: "카드" },
  { key: "cash", label: "현금" },
  { key: "transfer", label: "계좌이체" },
] as const;

const kst = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

export function CounterPayBanner() {
  const { getIdToken } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/crm/counter-pay/pending", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      /* 다음 주기에 다시 */
    }
  }, [getIdToken]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 60_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(first);
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  if (items.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left px-5 md:px-8 py-3 bg-blue-600 text-white flex items-center gap-3 hover:bg-blue-700"
      >
        <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-white text-blue-600 text-[13px] font-extrabold">
          {items.length}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-bold">이용권 결제 요청</span>
          <span className="block text-[12.5px] text-white/85 truncate">
            {items
              .slice(0, 3)
              .map((i) => `${i.memberName} 회원 · ${i.productName}`)
              .join(" / ")}
            {items.length > 3 ? ` 외 ${items.length - 3}건` : ""} — 카운터에서 결제 후 승인해 주세요
          </span>
        </span>
        <span className="shrink-0 px-3 py-1.5 rounded-lg bg-white text-blue-700 text-[12.5px] font-bold">
          확인하기
        </span>
      </button>
      <CounterPayModal
        open={open}
        items={items}
        onClose={() => setOpen(false)}
        onDone={async () => {
          await load();
        }}
      />
    </>
  );
}

function CounterPayModal({
  open,
  items,
  onClose,
  onDone,
}: {
  open: boolean;
  items: Item[];
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { getIdToken } = useAuth();
  const [pay, setPay] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [canceling, setCanceling] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const act = async (orderId: number, body: Record<string, unknown>) => {
    setBusyId(orderId);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/counter-pay/orders/${orderId}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "처리하지 못했어요");
      setCanceling(null);
      setReason("");
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했어요");
    } finally {
      setBusyId(null);
    }
  };

  useEffect(() => {
    if (open && items.length === 0) onClose();
  }, [open, items.length, onClose]);

  return (
    <CrmModal open={open} onClose={onClose} title="이용권 결제 요청" size="lg">
      <p className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed mb-3">
        회원이 앱에서 구매를 요청했어요. <b>카운터에서 결제를 받은 뒤</b> 결제수단을 고르고 승인해 주세요. 승인하면 바로
        이용권이 발급되고 회원에게 알림이 가요. 결제하지 않고 갔다면 요청을 취소해 주세요.
      </p>
      {error && <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 text-[12.5px] text-red-700">{error}</div>}
      <ul className="space-y-3">
        {items.map((it) => {
          const sel = pay[it.orderId] ?? "card";
          return (
            <li key={it.orderId} className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <a
                    href={`/crm/members/${it.memberId}`}
                    className="text-[14.5px] font-bold text-[#2A251D] dark:text-zinc-100 hover:underline"
                  >
                    {it.memberName}
                  </a>
                  {it.memberPhone && (
                    <span className="ml-1.5 text-[12px] text-[#8C8270]">{formatPhone(it.memberPhone)}</span>
                  )}
                  <div className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400 truncate">{it.productName}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[17px] font-extrabold text-[#2A251D] dark:text-zinc-100 tabular-nums">
                    {it.amountWon.toLocaleString()}원
                  </div>
                  <div className="text-[11px] text-[#A89B80]">요청 {kst(it.requestedAt)}</div>
                </div>
              </div>
              {(it.couponDiscountWon > 0 || it.mileageUsed > 0) && (
                <div className="mt-1 text-[11.5px] text-[#8C8270]">
                  상품 {it.listPriceWon.toLocaleString()}원
                  {it.couponDiscountWon > 0 && ` · 쿠폰 -${it.couponDiscountWon.toLocaleString()}원`}
                  {it.mileageUsed > 0 && ` · 마일리지 -${it.mileageUsed.toLocaleString()}P`}
                </div>
              )}

              {canceling === it.orderId ? (
                <div className="mt-2.5 space-y-2">
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="취소 사유 (선택) — 예: 결제하지 않고 감"
                    className="w-full px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px]"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCanceling(null)}
                      className="px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13px] text-[#6B5D47] dark:text-zinc-300"
                    >
                      돌아가기
                    </button>
                    <button
                      type="button"
                      disabled={busyId === it.orderId}
                      onClick={() => act(it.orderId, { action: "cancel", reason: reason.trim() || null })}
                      className="px-3 py-2 rounded-lg bg-red-600 text-white text-[13px] font-semibold disabled:opacity-50"
                    >
                      요청 취소 확정
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mt-2.5 flex items-center gap-1.5">
                    <span className="text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-400 mr-1">받은 결제</span>
                    {PAY_OPTIONS.map((o) => (
                      <button
                        key={o.key}
                        type="button"
                        onClick={() => setPay((p) => ({ ...p, [it.orderId]: o.key }))}
                        className={`px-2.5 py-1 rounded-lg text-[12.5px] font-semibold border ${
                          sel === o.key
                            ? "border-[#6B7B3A] bg-[#6B7B3A]/12 text-[#4F5C2A] dark:text-[#C5D49A]"
                            : "border-[#E8E0D0] dark:border-zinc-700 text-[#6B5D47] dark:text-zinc-300"
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2.5 grid grid-cols-[1fr_auto] gap-2">
                    <button
                      type="button"
                      disabled={busyId === it.orderId}
                      onClick={() => act(it.orderId, { action: "approve", pay: sel })}
                      className="px-3 py-2.5 rounded-lg bg-[#6B7B3A] text-white text-[13.5px] font-bold disabled:opacity-50"
                    >
                      {busyId === it.orderId ? "처리 중…" : "결제완료 후 승인"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCanceling(it.orderId)}
                      className="px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13px] text-[#6B5D47] dark:text-zinc-300"
                    >
                      요청 취소
                    </button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </CrmModal>
  );
}
