"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { CrmModal, crmInputClass } from "../../_components/crm-modal";
import {
  ISSUE_TYPE_LABEL,
  PAYMENT_METHOD_LABEL,
  PASS_STATUS_LABEL,
  formatWon,
  formatPhone,
} from "../../_components/crm-labels";

export interface PassDetail {
  id: number;
  member_id: number;
  trainer_member_id: number;
  co_trainer_ids: number[] | null;
  seller_member_id: number;
  issue_type: string;
  lesson_kind: string;
  total_sessions: number;
  remaining_sessions: number;
  session_minutes: number;
  price_won: number;
  vat_included: boolean;
  payment_method: string;
  payment_method_custom: string | null;
  issued_at: string;
  expires_at: string;
  status: string;
  memo: string | null;
}

interface Member {
  id: number;
  name: string;
  phone: string | null;
}

interface StaffOption {
  id: number;
  display_name: string;
  role: string;
  status: string;
}

interface Props {
  passId: number | null;
  staff: StaffOption[];
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function PassDetailModal({ passId, staff, canEdit, onClose, onSaved }: Props) {
  const { getIdToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pass, setPass] = useState<PassDetail | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [editMode, setEditMode] = useState(false);

  // 편집 필드
  const [lessonKind, setLessonKind] = useState("");
  const [totalSessions, setTotalSessions] = useState<number>(0);
  const [remainingSessions, setRemainingSessions] = useState<number>(0);
  const [sessionMinutes, setSessionMinutes] = useState<number>(0);
  const [priceWon, setPriceWon] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentMethodCustom, setPaymentMethodCustom] = useState("");
  const [trainerMemberId, setTrainerMemberId] = useState<number>(0);
  const [expiresAt, setExpiresAt] = useState("");
  const [memo, setMemo] = useState("");

  useEffect(() => {
    if (!passId) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const token = await getIdToken();
        const res = await fetch(`/api/crm/passes/${passId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(data.error || "조회 실패");
        setPass(data.pass);
        setMember(data.member);
        // 편집 필드 초기화
        const p: PassDetail = data.pass;
        setLessonKind(p.lesson_kind ?? "");
        setTotalSessions(p.total_sessions ?? 0);
        setRemainingSessions(p.remaining_sessions ?? 0);
        setSessionMinutes(p.session_minutes ?? 0);
        setPriceWon(p.price_won ?? 0);
        setPaymentMethod(p.payment_method ?? "cash");
        setPaymentMethodCustom(p.payment_method_custom ?? "");
        setTrainerMemberId(p.trainer_member_id ?? 0);
        setExpiresAt(p.expires_at ?? "");
        setMemo(p.memo ?? "");
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [passId, getIdToken]);

  async function handleSave() {
    if (!passId) return;
    setSaving(true);
    setError("");
    try {
      const token = await getIdToken();
      const patch: Record<string, unknown> = {
        lesson_kind: lessonKind.trim(),
        total_sessions: totalSessions,
        remaining_sessions: remainingSessions,
        session_minutes: sessionMinutes,
        price_won: priceWon,
        payment_method: paymentMethod,
        payment_method_custom: paymentMethod === "etc" ? paymentMethodCustom.trim() || null : null,
        trainer_member_id: trainerMemberId || undefined,
        expires_at: expiresAt || undefined,
        memo: memo.trim() || null,
      };
      const res = await fetch(`/api/crm/passes/${passId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

  const staffName = pass ? staff.find((s) => s.id === pass.trainer_member_id)?.display_name ?? "—" : "—";
  const activeStaff = staff.filter((s) => s.status === "active" || s.id === pass?.trainer_member_id);

  return (
    <CrmModal open={!!passId} onClose={onClose} title={editMode ? "수강권 수정" : "수강권 상세"} size="lg">
      {loading ? (
        <div className="py-10 text-center text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : !pass ? (
        <div className="py-10 text-center text-[13px] text-red-600">{error || "수강권을 찾을 수 없어요"}</div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{error}</div>
          )}

          {/* 요약 */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="px-2 py-0.5 rounded-full text-[11.5px] font-semibold bg-[#6B7B3A]/15 text-[#6B7B3A] border border-[#6B7B3A]/30">
              {ISSUE_TYPE_LABEL[pass.issue_type] ?? pass.issue_type}
            </span>
            <StatusChip status={pass.status} />
            {member && (
              <span className="text-[13px] text-[#3A342A] dark:text-zinc-200">
                <span className="font-semibold">{member.name}</span>
                <span className="ml-2 text-[#8C8270]">{member.phone ? formatPhone(member.phone) : ""}</span>
              </span>
            )}
          </div>

          {/* 필드 그리드 */}
          <div className="grid grid-cols-2 gap-3">
            <ModalField label="수강권">
              {editMode ? (
                <input value={lessonKind} onChange={(e) => setLessonKind(e.target.value)} className={crmInputClass} />
              ) : (
                pass.lesson_kind || "—"
              )}
            </ModalField>
            <ModalField label="담당 강사">
              {editMode ? (
                <select value={trainerMemberId} onChange={(e) => setTrainerMemberId(Number(e.target.value))} className={crmInputClass}>
                  <option value={0}>선택</option>
                  {activeStaff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.display_name}
                    </option>
                  ))}
                </select>
              ) : (
                staffName
              )}
            </ModalField>
            <ModalField label="총 세션">
              {editMode ? (
                <input type="number" min={0} value={totalSessions} onChange={(e) => setTotalSessions(Number(e.target.value))} className={crmInputClass} />
              ) : (
                `${pass.total_sessions}회`
              )}
            </ModalField>
            <ModalField label="잔여 세션">
              {editMode ? (
                <input type="number" min={0} value={remainingSessions} onChange={(e) => setRemainingSessions(Number(e.target.value))} className={crmInputClass} />
              ) : (
                `${pass.remaining_sessions} / ${pass.total_sessions}`
              )}
            </ModalField>
            <ModalField label="회당 시간">
              {editMode ? (
                <input type="number" min={0} value={sessionMinutes} onChange={(e) => setSessionMinutes(Number(e.target.value))} className={crmInputClass} />
              ) : (
                `${pass.session_minutes}분`
              )}
            </ModalField>
            <ModalField label="금액">
              {editMode ? (
                <input type="number" min={0} value={priceWon} onChange={(e) => setPriceWon(Number(e.target.value))} className={crmInputClass} />
              ) : (
                <span>
                  {formatWon(pass.price_won)}원
                  {pass.vat_included && <span className="ml-1 text-[11.5px] text-[#A89B80]">부가세 포함</span>}
                </span>
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
              ) : pass.payment_method === "etc" && pass.payment_method_custom ? (
                pass.payment_method_custom
              ) : (
                PAYMENT_METHOD_LABEL[pass.payment_method] ?? pass.payment_method
              )}
            </ModalField>
            <ModalField label="구매일">{pass.issued_at}</ModalField>
            <ModalField label="만료일">
              {editMode ? (
                <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={crmInputClass} />
              ) : (
                pass.expires_at
              )}
            </ModalField>
          </div>

          {/* 메모 */}
          <div>
            <div className="text-[11.5px] text-[#8C8270] dark:text-zinc-500 mb-0.5">메모</div>
            {editMode ? (
              <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} className={crmInputClass} />
            ) : (
              <div className="whitespace-pre-wrap text-[13.5px] text-[#3A342A] dark:text-zinc-200 border border-[#E8E0D0] dark:border-zinc-800 rounded-lg px-3 py-2 bg-[#FEFCF7] dark:bg-zinc-900 min-h-[40px]">
                {pass.memo || <span className="text-[#A89B80]">—</span>}
              </div>
            )}
          </div>

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
      )}
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
