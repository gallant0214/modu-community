"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { CrmModal, crmInputClass } from "../../_components/crm-modal";
import {
  PAYMENT_METHOD_LABEL,
  PASS_STATUS_LABEL,
  formatWon,
  parseWon,
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

        <section className="rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/75 dark:bg-zinc-900 px-4 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-md text-[11.5px] font-bold bg-[#EFF5E2] text-[#4D622C] border border-[#DDE8C5]">
                  기간형 이용권
                </span>
                <StatusChip status={row.status} />
              </div>
              <h3 className="mt-2 text-[19px] font-bold text-[#241F18] dark:text-zinc-100 truncate">
                {row.plan_name || "회원권"}
              </h3>
              <div className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400 truncate">
                <span className="font-semibold text-[#2A251D] dark:text-zinc-200">{row.member_name || "—"}</span>
                {row.member_phone && <span className="ml-2">{formatPhone(row.member_phone)}</span>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[11px] font-semibold text-[#8C8270] dark:text-zinc-500">이용 기간</div>
              <div className="mt-1 text-[14px] font-bold text-[#2F3A2B] dark:text-[#A8B87A]">{row.duration_days}일</div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <SummaryTile label="결제 금액" value={`${formatWon(row.price_won)}원`} hint="회원권 결제" tone="dark" />
            <SummaryTile label="시작일" value={row.start_date} hint={row.purchased_at ? `구매 ${row.purchased_at}` : "구매일 미입력"} tone="blue" />
            <SummaryTile label="만료일" value={row.expires_at === "9999-12-31" ? "무기한" : row.expires_at} hint={row.expires_at === "9999-12-31" ? "" : expiryLabel(row.expires_at, row.status)} tone={row.expires_at !== "9999-12-31" && daysUntil(row.expires_at) <= 7 ? "gold" : "green"} />
          </div>
        </section>

        <SectionTitle title={editMode ? "수정 정보" : "상세 정보"} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <InfoPanel title="이용 정보">
            <ModalField label="상품명">{row.plan_name || "—"}</ModalField>
            <ModalField label="기간">{row.duration_days}일</ModalField>
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
                <span className="inline-flex items-center gap-2">
                  {row.expires_at === "9999-12-31" ? "무기한" : row.expires_at}
                  {row.expires_at !== "9999-12-31" && (
                    <ExpiryBadge expiresAt={row.expires_at} status={row.status} />
                  )}
                </span>
              )}
            </ModalField>
          </InfoPanel>

          <InfoPanel title="결제 정보">
            <ModalField label="금액">
              {editMode ? (
                <div className="relative">
                  <input
                    inputMode="numeric"
                    value={priceWon ? formatWon(priceWon) : ""}
                    onChange={(e) => setPriceWon(parseWon(e.target.value))}
                    className={`${crmInputClass} pr-9`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] text-[#A89B80]">원</span>
                </div>
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
            <ModalField label="상태">
              <StatusChip status={row.status} />
            </ModalField>
          </InfoPanel>
        </div>

        {editMode && (
          <InfoPanel title="변경 메모">
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={3}
              className={crmInputClass}
              placeholder="변경 사유·메모 (선택)"
            />
          </InfoPanel>
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
    <div className="min-w-0">
      <div className="text-[11.5px] font-semibold text-[#8C8270] dark:text-zinc-500 mb-1">{label}</div>
      <div className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 min-w-0">{children}</div>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-px flex-1 bg-[#E8E0D0] dark:bg-zinc-800" />
      <div className="text-[11px] font-bold text-[#8C8270] dark:text-zinc-500">{title}</div>
      <div className="h-px flex-1 bg-[#E8E0D0] dark:bg-zinc-800" />
    </div>
  );
}

function InfoPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-950/40 px-4 py-3">
      <h4 className="mb-3 text-[12.5px] font-bold text-[#6B5D47] dark:text-zinc-300">{title}</h4>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function SummaryTile({
  label,
  value,
  hint,
  tone = "green",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "green" | "blue" | "gold" | "dark";
}) {
  const cls =
    tone === "blue"
      ? "bg-[#EFF7F8] text-[#315F7A] border-[#D7E7EA]"
      : tone === "gold"
      ? "bg-[#FFF8E6] text-[#826424] border-[#EAD9AA]"
      : tone === "dark"
      ? "bg-[#F4F1EA] text-[#2A251D] border-[#DDD3C2]"
      : "bg-[#F3F7EA] text-[#3E5D2D] border-[#DDE8C5]";

  return (
    <div className={`rounded-lg border px-3 py-2.5 min-w-0 ${cls} dark:bg-zinc-950 dark:border-zinc-800`}>
      <div className="text-[10.5px] font-bold opacity-70 whitespace-nowrap">{label}</div>
      <div className="mt-1 text-[15px] font-bold tracking-normal truncate">{value}</div>
      <div className="mt-0.5 text-[11px] opacity-70 truncate">{hint}</div>
    </div>
  );
}

function ExpiryBadge({ expiresAt, status }: { expiresAt: string; status: string }) {
  const urgent = status === "valid" && daysUntil(expiresAt) <= 7;
  return (
    <span
      className={`px-1.5 py-0.5 rounded-md text-[10.5px] font-bold ${
        urgent
          ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
          : "bg-[#F5F0E5] text-[#7A6B51] dark:bg-zinc-800 dark:text-zinc-400"
      }`}
    >
      {expiryLabel(expiresAt, status)}
    </span>
  );
}

function expiryLabel(expiresAt: string, status: string) {
  if (expiresAt === "9999-12-31") return "무기한";
  const dDay = daysUntil(expiresAt);
  if (status !== "valid") return "종료";
  if (dDay < 0) return "만료";
  if (dDay === 0) return "오늘";
  return `D-${dDay}`;
}

function daysUntil(ymd: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${ymd}T00:00:00`);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function StatusChip({ status }: { status: string }) {
  const label = PASS_STATUS_LABEL[status] ?? status;
  const cls =
    status === "valid"
      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
      : status === "expired"
      ? "bg-[#F5F0E5] text-[#A89B80] dark:bg-zinc-800 dark:text-zinc-500"
      : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  return <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${cls}`}>{label}</span>;
}
