"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { CrmModal, crmInputClass } from "../../_components/crm-modal";
import {
  PAYMENT_METHOD_LABEL,
  PASS_STATUS_LABEL,
  formatWon,
  formatPhone,
} from "../../_components/crm-labels";

export interface MembershipRow {
  id: number;
  member_id: number;
  member_name: string;
  member_phone: string | null;
  member_face_thumb: string | null;
  plan_name: string;
  duration_days: number;
  price_won: number;
  payment_method: string;
  payment_method_custom: string | null;
  start_date: string;
  expires_at: string;
  purchased_at: string | null;
  status: string;
}

interface Props {
  row: MembershipRow | null;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function MembershipDetailModal({ row, canEdit, onClose, onSaved }: Props) {
  const { getIdToken } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editMode, setEditMode] = useState(false);

  const [priceWon, setPriceWon] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentMethodCustom, setPaymentMethodCustom] = useState("");
  const [startDate, setStartDate] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [purchasedAt, setPurchasedAt] = useState("");
  const [memo, setMemo] = useState("");

  useEffect(() => {
    if (!row) return;
    setPriceWon(row.price_won ?? 0);
    setPaymentMethod(row.payment_method ?? "cash");
    setPaymentMethodCustom(row.payment_method_custom ?? "");
    setStartDate(row.start_date ?? "");
    setExpiresAt(row.expires_at ?? "");
    setPurchasedAt(row.purchased_at ?? "");
    setMemo("");
    setEditMode(false);
    setError("");
  }, [row]);

  async function handleSave() {
    if (!row) return;
    setSaving(true);
    setError("");
    try {
      const token = await getIdToken();
      const patch: Record<string, unknown> = {
        price_won: priceWon,
        payment_method: paymentMethod,
        payment_method_custom: paymentMethod === "etc" ? paymentMethodCustom.trim() || null : null,
        start_date: startDate || undefined,
        expires_at: expiresAt || undefined,
        purchased_at: purchasedAt || undefined,
      };
      if (memo.trim()) patch.memo = memo.trim();
      const res = await fetch(`/api/crm/memberships/${row.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "수정 실패");
      setEditMode(false);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!row) return null;

  return (
    <CrmModal open onClose={onClose} title={editMode ? "회원권 수정" : "회원권 상세"} size="lg">
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{error}</div>
        )}

        {/* 요약 */}
        <div className="flex flex-wrap gap-2 items-center">
          <StatusChip status={row.status} />
          <span className="text-[13px] text-[#3A342A] dark:text-zinc-200">
            <span className="font-semibold">{row.member_name || "—"}</span>
            <span className="ml-2 text-[#8C8270]">{row.member_phone ? formatPhone(row.member_phone) : ""}</span>
          </span>
        </div>

        {/* 필드 그리드 */}
        <div className="grid grid-cols-2 gap-3">
          <ModalField label="상품명">{row.plan_name || "—"}</ModalField>
          <ModalField label="기간(일)">{row.duration_days}일</ModalField>
          <ModalField label="금액">
            {editMode ? (
              <input type="number" min={0} value={priceWon} onChange={(e) => setPriceWon(Number(e.target.value))} className={crmInputClass} />
            ) : (
              `${formatWon(row.price_won)}원`
            )}
          </ModalField>
          <ModalField label="결제 수단">
            {editMode ? (
              <div className="space-y-1">
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={crmInputClass}>
                  {Object.entries(PAYMENT_METHOD_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                {paymentMethod === "etc" && (
                  <input value={paymentMethodCustom} onChange={(e) => setPaymentMethodCustom(e.target.value)} className={crmInputClass} placeholder="결제 수단 직접 입력" />
                )}
              </div>
            ) : row.payment_method === "etc" && row.payment_method_custom ? (
              row.payment_method_custom
            ) : (
              PAYMENT_METHOD_LABEL[row.payment_method] ?? row.payment_method
            )}
          </ModalField>
          <ModalField label="구매일">
            {editMode ? (
              <input type="date" value={purchasedAt} onChange={(e) => setPurchasedAt(e.target.value)} className={crmInputClass} />
            ) : (
              row.purchased_at ?? "—"
            )}
          </ModalField>
          <ModalField label="시작일">
            {editMode ? (
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={crmInputClass} />
            ) : (
              row.start_date
            )}
          </ModalField>
          <ModalField label="만료일">
            {editMode ? (
              <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={crmInputClass} />
            ) : (
              row.expires_at
            )}
          </ModalField>
        </div>

        {editMode && (
          <div>
            <div className="text-[11.5px] text-[#8C8270] dark:text-zinc-500 mb-0.5">메모 (변경 시 입력)</div>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} className={crmInputClass} placeholder="변경 사유·메모 (선택)" />
          </div>
        )}

        {/* 액션 */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E8E0D0] dark:border-zinc-800">
          {editMode ? (
            <>
              <button
                type="button"
                onClick={() => setEditMode(false)}
                disabled={saving}
                className="px-4 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13px] font-medium text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932] disabled:opacity-50"
              >
                {saving ? "저장 중…" : "저장"}
              </button>
            </>
          ) : (
            <>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setEditMode(true)}
                  className="px-4 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932]"
                >
                  수정
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13px] font-medium text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5]"
              >
                닫기
              </button>
            </>
          )}
        </div>
      </div>
    </CrmModal>
  );
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11.5px] text-[#8C8270] dark:text-zinc-500 mb-0.5">{label}</div>
      <div className="text-[14px] font-medium text-[#2A251D] dark:text-zinc-100">{children}</div>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const label = PASS_STATUS_LABEL[status] ?? status;
  const cls =
    status === "valid"
      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
      : status === "expired"
      ? "bg-[#F5F0E5] text-[#A89B80] dark:bg-zinc-800 dark:text-zinc-500"
      : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  return <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${cls}`}>{label}</span>;
}
