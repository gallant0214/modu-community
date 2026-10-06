"use client";

import { useState } from "react";

/**
 * 결제내역 '수정' 창 — 금액 항목을 발급창과 같은 순서로 보여준다.
 *   상품 금액 → 할인 금액 → 마일리지 사용 → 최종 결제 금액
 *
 * 🚨 예전엔 결제행 금액만 고칠 수 있어 마일리지를 잘못 넣으면 손댈 방법이 없었다.
 *    저장하면 서버가 상품 레코드(금액·할인·마일리지)와 회원 마일리지 잔액·원장까지
 *    함께 맞춘다. 상품 종류·기간은 여기서 바꾸지 않는다(그건 상품 상세에서).
 */
export interface PaymentEditValue {
  priceWon: number;
  discountWon: number;
  mileageUsed: number;
  paidDate: string;
  method: string;
  methodCustom: string;
  note: string;
}

export function PaymentEditDialog({
  open,
  productName,
  /** 회원이 지금 보유한 마일리지 (추가로 쓸 수 있는 상한 계산용) */
  memberMileage,
  initial,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  productName: string;
  memberMileage: number;
  initial: PaymentEditValue;
  busy?: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (v: PaymentEditValue) => void;
}) {
  if (!open) return null;
  // 열 때마다 현재 값으로 시작 (닫으면 언마운트되므로 effect 로 초기화하지 않는다)
  return (
    <Body
      productName={productName}
      memberMileage={memberMileage}
      initial={initial}
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[14px] text-right tabular-nums text-[#2A251D] dark:text-zinc-100";

function Body({
  productName,
  memberMileage,
  initial,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  productName: string;
  memberMileage: number;
  initial: PaymentEditValue;
  busy?: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (v: PaymentEditValue) => void;
}) {
  const [price, setPrice] = useState(String(initial.priceWon));
  const [discount, setDiscount] = useState(String(initial.discountWon));
  const [mileage, setMileage] = useState(String(initial.mileageUsed));
  const [paidDate, setPaidDate] = useState(initial.paidDate);
  const [method, setMethod] = useState(initial.method);
  const [methodCustom, setMethodCustom] = useState(initial.methodCustom);
  const [note, setNote] = useState(initial.note);

  const num = (v: string) => Math.max(0, Math.trunc(Number(v.replace(/[^\d]/g, "")) || 0));
  const priceWon = num(price);
  const discountWon = num(discount);
  const mileageUsed = num(mileage);
  const finalWon = Math.max(0, priceWon - discountWon - mileageUsed);
  // 이미 쓴 만큼은 되돌릴 수 있고, 추가로 쓸 수 있는 건 보유 잔액까지
  const mileageCap = initial.mileageUsed + memberMileage;
  const mileageOver = mileageUsed > mileageCap;
  const overPrice = discountWon + mileageUsed > priceWon;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80" onClick={busy ? undefined : onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
        <div className="px-4 py-3 border-b border-[#E8E0D0] dark:border-zinc-800">
          <div className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">결제 수정</div>
          <div className="mt-0.5 text-[12px] text-[#8C8270] dark:text-zinc-500 truncate">{productName}</div>
        </div>
        <div className="p-4 space-y-3">
          <Field label="상품 금액" suffix="원">
            <input inputMode="numeric" value={priceWon.toLocaleString()} onChange={(e) => setPrice(e.target.value)} className={inputCls} />
          </Field>
          <Field label="할인 금액" suffix="원">
            <input inputMode="numeric" value={discountWon.toLocaleString()} onChange={(e) => setDiscount(e.target.value)} className={inputCls} />
          </Field>
          <Field label="마일리지 사용" suffix="P" hint={`보유 ${memberMileage.toLocaleString()}P`}>
            <input inputMode="numeric" value={mileageUsed.toLocaleString()} onChange={(e) => setMileage(e.target.value)} className={inputCls} />
          </Field>

          <div className="flex items-baseline justify-between px-3 py-2.5 rounded-xl bg-[#6B7B3A]/[0.07] border border-[#6B7B3A]/25">
            <span className="text-[12.5px] font-semibold text-[#4d5a29] dark:text-[#A8B87A]">최종 결제 금액</span>
            <span className="text-[16px] font-extrabold text-[#2A251D] dark:text-zinc-100 tabular-nums">
              {finalWon.toLocaleString()}원
            </span>
          </div>
          {mileageOver && (
            <p className="text-[11.5px] text-red-600 dark:text-red-400">
              쓸 수 있는 마일리지는 최대 {mileageCap.toLocaleString()}P 예요 (기존 사용 {initial.mileageUsed.toLocaleString()}P + 보유 {memberMileage.toLocaleString()}P).
            </p>
          )}
          {overPrice && (
            <p className="text-[11.5px] text-[#B47B2A] dark:text-amber-300">
              할인 + 마일리지가 상품 금액보다 커서 최종 결제 금액을 0원으로 계산했어요.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <label className="text-[12px] text-[#6B5D47] dark:text-zinc-400">
              결제일
              <input
                type="date"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
                className="mt-0.5 w-full px-2 py-1.5 rounded border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px] text-[#2A251D] dark:text-zinc-100"
              />
            </label>
            <label className="text-[12px] text-[#6B5D47] dark:text-zinc-400">
              결제수단
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="mt-0.5 w-full px-2 py-1.5 rounded border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px] text-[#2A251D] dark:text-zinc-100"
              >
                <option value="cash">현금</option>
                <option value="card">카드</option>
                <option value="transfer">계좌이체</option>
                <option value="etc">기타</option>
              </select>
            </label>
          </div>
          {method === "etc" && (
            <label className="block text-[12px] text-[#6B5D47] dark:text-zinc-400">
              수단(직접입력)
              <input
                type="text"
                value={methodCustom}
                onChange={(e) => setMethodCustom(e.target.value)}
                className="mt-0.5 w-full px-2 py-1.5 rounded border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px] text-[#2A251D] dark:text-zinc-100"
              />
            </label>
          )}
          <label className="block text-[12px] text-[#6B5D47] dark:text-zinc-400">
            메모
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-0.5 w-full px-2 py-1.5 rounded border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px] text-[#2A251D] dark:text-zinc-100"
            />
          </label>

          <p className="text-[11px] text-[#A89B80] leading-relaxed">
            저장하면 상품의 금액·할인·마일리지와 회원 마일리지 잔액이 함께 맞춰집니다.
            상품 종류·기간은 상품 카드에서 수정해 주세요.
          </p>

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
            disabled={busy || mileageOver}
            onClick={() =>
              onSubmit({
                priceWon,
                discountWon,
                mileageUsed,
                paidDate,
                method,
                methodCustom,
                note,
              })
            }
            className="px-3.5 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold disabled:opacity-50"
          >
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  suffix,
  hint,
  children,
}: {
  label: string;
  suffix: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-400">{label}</span>
        {hint && <span className="text-[11px] text-[#A89B80]">{hint}</span>}
      </div>
      <div className="flex items-center gap-2">
        {children}
        <span className="text-[13px] text-[#6B5D47] dark:text-zinc-400 shrink-0">{suffix}</span>
      </div>
    </div>
  );
}
