"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { CrmModal } from "./crm-modal";
import { formatPhone } from "./crm-labels";

/**
 * '미수 · 온누리 결제 확인 요망' 배너 — 대시보드·회원관리·출석현황 맨 위.
 *
 * 회원이 모바일 온누리로 결제했다고 했는데 10분 안에 공기계 알림과 못 맞춘 주문이 있으면 뜬다.
 * 🚨 승인하거나 거절할 때까지 **계속 떠 있다** (닫기 버튼 없음 — 사장님 요청).
 * 권한(sales.onnuri_confirm)이 없는 직원에게는 서버가 빈 목록을 줘서 보이지 않는다.
 */
interface Candidate {
  id: number;
  amountWon: number | null;
  postedAt: string;
  text: string;
}
interface Item {
  orderId: number;
  memberId: number;
  memberName: string;
  memberPhone: string | null;
  productName: string;
  amountWon: number;
  state: "waiting" | "claimed";
  startedAt: string | null;
  claimedAt: string | null;
  candidates: Candidate[];
}

const kst = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

export function OnnuriPendingBanner() {
  const { getIdToken } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/crm/onnuri/pending", {
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
        className="w-full text-left px-5 md:px-8 py-3 bg-red-600 text-white flex items-center gap-3 hover:bg-red-700"
      >
        <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-white text-red-600 text-[13px] font-extrabold">
          {items.length}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-bold">미수 · 온누리 결제 확인 요망</span>
          <span className="block text-[12.5px] text-white/85 truncate">
            {items
              .slice(0, 3)
              .map((i) => `${i.memberName} ${i.amountWon.toLocaleString()}원`)
              .join(" · ")}
            {items.length > 3 ? ` 외 ${items.length - 3}건` : ""} — 결제를 확인하고 승인해 주세요
          </span>
        </span>
        <span className="shrink-0 px-3 py-1.5 rounded-lg bg-white text-red-700 text-[12.5px] font-bold">
          확인하기
        </span>
      </button>
      <OnnuriConfirmModal
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

function OnnuriConfirmModal({
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
  const [picked, setPicked] = useState<Record<number, number | "none">>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const act = async (orderId: number, body: Record<string, unknown>) => {
    setBusyId(orderId);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/onnuri/orders/${orderId}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "처리하지 못했어요");
      setRejecting(null);
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
    <CrmModal open={open} onClose={onClose} title="온누리 결제 확인" size="lg">
      <p className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed mb-3">
        온누리 <b>가맹점 앱의 결제 내역</b>에서 금액·시각이 맞는지 확인한 뒤 승인해 주세요. 승인하면 바로 이용권이
        발급되고, 거절하면 주문이 취소되고 임시 입장도 끝나요.
      </p>
      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 text-[12.5px] text-red-700">{error}</div>
      )}
      <ul className="space-y-3">
        {items.map((it) => {
          const sel = picked[it.orderId] ?? (it.candidates.length === 1 ? it.candidates[0].id : "none");
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
                  <div className="text-[11px] text-[#A89B80]">
                    {it.state === "claimed" ? `결제했어요 ${kst(it.claimedAt)}` : `온누리 선택 ${kst(it.startedAt)}`}
                  </div>
                </div>
              </div>
              <div className="mt-1 text-[11.5px] font-semibold">
                {it.state === "claimed" ? (
                  <span className="text-amber-700 dark:text-amber-300">임시 입장 중 · 공기계 알림과 자동으로 맞추지 못했어요</span>
                ) : (
                  <span className="text-sky-700 dark:text-sky-300">같은 금액 결제 알림은 왔는데 회원이 &lsquo;결제했어요&rsquo;를 누르지 않았어요</span>
                )}
              </div>

              <div className="mt-2.5 rounded-lg bg-[#FBF7EB] dark:bg-zinc-900 p-2.5">
                <div className="text-[11.5px] font-semibold text-[#6B5D47] dark:text-zinc-400 mb-1.5">
                  연결할 공기계 결제 알림
                </div>
                <div className="space-y-1">
                  {it.candidates.map((c) => (
                    <label key={c.id} className="flex items-start gap-2 text-[12.5px] cursor-pointer">
                      <input
                        type="radio"
                        name={`n${it.orderId}`}
                        checked={sel === c.id}
                        onChange={() => setPicked((p) => ({ ...p, [it.orderId]: c.id }))}
                        className="mt-0.5 accent-[#6B7B3A]"
                      />
                      <span className="min-w-0">
                        <b className="tabular-nums">{(c.amountWon ?? 0).toLocaleString()}원</b>
                        <span className="ml-1 text-[#8C8270]">{kst(c.postedAt)}</span>
                        <span className="block text-[11.5px] text-[#A89B80] truncate">{c.text}</span>
                      </span>
                    </label>
                  ))}
                  <label className="flex items-center gap-2 text-[12.5px] cursor-pointer">
                    <input
                      type="radio"
                      name={`n${it.orderId}`}
                      checked={sel === "none"}
                      onChange={() => setPicked((p) => ({ ...p, [it.orderId]: "none" }))}
                      className="accent-[#6B7B3A]"
                    />
                    <span>
                      알림 없이 승인 <span className="text-[#A89B80]">— 가맹점 앱에서 직접 확인했어요</span>
                    </span>
                  </label>
                </div>
              </div>

              {rejecting === it.orderId ? (
                <div className="mt-2.5 space-y-2">
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="거절 사유 (선택) — 예: 결제 내역 없음"
                    className="w-full px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px]"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRejecting(null)}
                      className="px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13px] text-[#6B5D47] dark:text-zinc-300"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      disabled={busyId === it.orderId}
                      onClick={() => act(it.orderId, { action: "reject", reason: reason.trim() || null })}
                      className="px-3 py-2 rounded-lg bg-red-600 text-white text-[13px] font-semibold disabled:opacity-50"
                    >
                      거절 확정
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2.5 grid grid-cols-[1fr_auto] gap-2">
                  <button
                    type="button"
                    disabled={busyId === it.orderId}
                    onClick={() =>
                      act(it.orderId, { action: "approve", notification_id: sel === "none" ? null : sel })
                    }
                    className="px-3 py-2.5 rounded-lg bg-[#6B7B3A] text-white text-[13.5px] font-bold hover:bg-[#5a6932] disabled:opacity-50"
                  >
                    {busyId === it.orderId ? "처리 중…" : "승인 · 이용권 발급"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejecting(it.orderId)}
                    className="px-3 py-2.5 rounded-lg border border-red-200 text-red-700 text-[13px] font-semibold hover:bg-red-50"
                  >
                    거절
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </CrmModal>
  );
}
