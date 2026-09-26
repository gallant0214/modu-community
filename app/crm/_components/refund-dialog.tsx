"use client";

import { useState } from "react";

/**
 * 환불 처리 창 — 회원권·수강권·대여권 상세, 결제내역 탭이 모두 이 창을 쓴다.
 * 실제로 돌려준 금액을 직원이 입력한다(자동 계산 없음, 기본값 = 결제 전액).
 * 입력액이 결제액보다 적으면 '부분 환불' 로 기록된다.
 */
export function RefundDialog(props: {
  open: boolean;
  /** 환불 대상 상품명 */
  productName: string;
  /** 결제 금액(환불 가능 상한) */
  paidWon: number;
  /** 대상별 주의 문구 (줄 단위) */
  notice?: string[];
  busy?: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (refundWon: number, reason: string) => void;
}) {
  if (!props.open) return null;
  // 닫으면 언마운트되므로 다음에 열 때 '결제 전액'으로 다시 시작한다 (effect 로 초기화하지 않는다)
  return <RefundDialogBody key={props.paidWon} {...props} />;
}

function RefundDialogBody({
  productName,
  paidWon,
  notice,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  productName: string;
  paidWon: number;
  notice?: string[];
  busy?: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (refundWon: number, reason: string) => void;
}) {
  const [amount, setAmount] = useState(String(Math.max(0, paidWon)));
  const [reason, setReason] = useState("");

  const won = Math.trunc(Number(amount.replace(/[^\d]/g, "")) || 0);
  const tooMuch = won > paidWon;
  const partial = won < paidWon;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80" onClick={busy ? undefined : onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E8E0D0] dark:border-zinc-800 text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">
          환불 처리
        </div>
        <div className="p-4 space-y-3">
          <div className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-white/70 dark:bg-zinc-950/40 px-3 py-2.5">
            <div className="text-[13px] font-semibold text-[#2A251D] dark:text-zinc-100 truncate">
              {productName || "상품"}
            </div>
            <div className="mt-0.5 text-[12px] text-[#8C8270] dark:text-zinc-500">
              결제 금액 {paidWon.toLocaleString()}원
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-400 mb-1">
              환불 금액
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={won === 0 && amount === "" ? "" : won.toLocaleString()}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[15px] font-bold text-right tabular-nums text-[#2A251D] dark:text-zinc-100"
              />
              <span className="text-[13px] text-[#6B5D47] dark:text-zinc-400">원</span>
              <button
                type="button"
                onClick={() => setAmount(String(paidWon))}
                className="px-2.5 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-300"
              >
                전액
              </button>
            </div>
            {tooMuch ? (
              <p className="mt-1 text-[11.5px] text-red-600 dark:text-red-400">
                결제 금액({paidWon.toLocaleString()}원)보다 많이 환불할 수 없어요.
              </p>
            ) : partial ? (
              <p className="mt-1 text-[11.5px] text-[#B47B2A] dark:text-amber-300">
                부분 환불로 기록됩니다 — 누적 결제에서 {won.toLocaleString()}원만 빠집니다.
              </p>
            ) : null}
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-400 mb-1">
              환불 사유 <span className="font-normal text-[#A89B80]">(선택)</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: 이사, 부상"
              className="w-full px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px] text-[#2A251D] dark:text-zinc-100"
            />
          </div>

          {(notice ?? []).length > 0 && (
            <ul className="rounded-xl bg-[#F5F0E5]/60 dark:bg-zinc-800/40 px-3 py-2.5 space-y-1">
              {(notice ?? []).map((n, i) => (
                <li key={i} className="text-[11.5px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed">
                  · {n}
                </li>
              ))}
            </ul>
          )}

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[12.5px] text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-[#E8E0D0] dark:border-zinc-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3.5 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-300 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onSubmit(won, reason.trim())}
            disabled={busy || tooMuch}
            className="px-3.5 py-2 rounded-lg bg-[#C0392B] text-white text-[13px] font-semibold disabled:opacity-50"
          >
            {busy ? "처리 중…" : "환불 처리"}
          </button>
        </div>
      </div>
    </div>
  );
}
