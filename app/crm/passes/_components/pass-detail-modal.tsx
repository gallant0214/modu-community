"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { CrmModal, crmInputClass } from "../../_components/crm-modal";
import {
  ISSUE_TYPE_LABEL,
  PAYMENT_METHOD_LABEL,
  PASS_STATUS_LABEL,
  formatWon,
  parseWon,
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
  const [vatIncluded, setVatIncluded] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentMethodCustom, setPaymentMethodCustom] = useState("");
  const [trainerMemberId, setTrainerMemberId] = useState<number>(0);
  const [coTrainerIds, setCoTrainerIds] = useState<number[]>([]);
  const [sellerMemberId, setSellerMemberId] = useState<number>(0);
  const [expiresAt, setExpiresAt] = useState("");
  const [memo, setMemo] = useState("");
  const [coTrainers, setCoTrainers] = useState<{ id: number; name: string }[]>([]);

  const loadPass = useCallback(async () => {
    if (!passId) return;
    setLoading(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/passes/${passId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "조회 실패");
      setPass(data.pass);
      setMember(data.member);
      setCoTrainers(data.co_trainers ?? []);
      // 편집 필드 초기화
      const p: PassDetail = data.pass;
      setLessonKind(p.lesson_kind ?? "");
      setTotalSessions(p.total_sessions ?? 0);
      setRemainingSessions(p.remaining_sessions ?? 0);
      setSessionMinutes(p.session_minutes ?? 0);
      setPriceWon(p.price_won ?? 0);
      setVatIncluded(!!p.vat_included);
      setPaymentMethod(p.payment_method ?? "cash");
      setPaymentMethodCustom(p.payment_method_custom ?? "");
      setTrainerMemberId(p.trainer_member_id ?? 0);
      setCoTrainerIds(
        (data.co_trainers ?? []).map((c: { id: number }) => c.id).length
          ? (data.co_trainers ?? []).map((c: { id: number }) => c.id)
          : p.co_trainer_ids ?? []
      );
      setSellerMemberId(p.seller_member_id ?? 0);
      setExpiresAt(p.expires_at ?? "");
      setMemo(p.memo ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [passId, getIdToken]);

  useEffect(() => {
    loadPass();
  }, [loadPass]);

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
        vat_included: vatIncluded,
        payment_method: paymentMethod,
        payment_method_custom: paymentMethod === "etc" ? paymentMethodCustom.trim() || null : null,
        trainer_member_id: trainerMemberId || undefined,
        co_trainer_ids: coTrainerIds,
        seller_member_id: sellerMemberId || undefined,
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
      onSaved();
      await loadPass();
      setEditMode(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const staffName = pass ? staff.find((s) => s.id === pass.trainer_member_id)?.display_name ?? "—" : "—";
  const activeStaff = staff.filter((s) => s.status === "active" || s.id === pass?.trainer_member_id);
  const sellerName = pass
    ? staff.find((s) => s.id === pass.seller_member_id)?.display_name ?? "—"
    : "—";
  const coTrainerNames = coTrainers
    .map((c) => c.name || staff.find((s) => s.id === c.id)?.display_name || "")
    .filter(Boolean)
    .join(", ");
  const remainingPct = pass
    ? Math.max(0, Math.min(100, (Number(pass.remaining_sessions || 0) / Math.max(1, Number(pass.total_sessions || 0))) * 100))
    : 0;

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

          <section className="rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/75 dark:bg-zinc-900 px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded-md text-[11.5px] font-bold bg-[#EFF5E2] text-[#4D622C] border border-[#DDE8C5]">
                    {ISSUE_TYPE_LABEL[pass.issue_type] ?? pass.issue_type}
                  </span>
                  <StatusChip status={pass.status} />
                </div>
                <h3 className="mt-2 text-[19px] font-bold text-[#241F18] dark:text-zinc-100 truncate">
                  {pass.lesson_kind || "수강권"}
                </h3>
                {member && (
                  <div className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400 truncate">
                    <span className="font-semibold text-[#2A251D] dark:text-zinc-200">{member.name}</span>
                    {member.phone && <span className="ml-2">{formatPhone(member.phone)}</span>}
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="text-[11px] font-semibold text-[#8C8270] dark:text-zinc-500">담당 강사</div>
                <div className="mt-1 text-[14px] font-bold text-[#2F3A2B] dark:text-[#A8B87A]">{staffName}</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <SummaryTile label="잔여 세션" value={`${pass.remaining_sessions}회`} hint={`총 ${pass.total_sessions}회`} tone={pass.remaining_sessions <= 2 ? "red" : "green"} />
              <SummaryTile label="결제 금액" value={`${formatWon(pass.price_won)}원`} hint={pass.vat_included ? "부가세 포함" : "부가세 없음"} tone="dark" />
              <SummaryTile label="만료일" value={pass.expires_at === "9999-12-31" ? "무기한" : pass.expires_at} hint={pass.expires_at === "9999-12-31" ? "" : expiryLabel(pass.expires_at, pass.status)} tone={pass.expires_at !== "9999-12-31" && daysUntil(pass.expires_at) <= 7 ? "gold" : "blue"} />
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11.5px] text-[#8C8270] dark:text-zinc-500">
                <span>수강 가능 잔여율</span>
                <span>{Math.round(remainingPct)}%</span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-[#ECE3D2] dark:bg-zinc-800 overflow-hidden">
                <div className="h-full rounded-full bg-[#6B7B3A]" style={{ width: `${remainingPct}%` }} />
              </div>
            </div>
          </section>

          <SectionTitle title={editMode ? "수정 정보" : "상세 정보"} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <InfoPanel title="이용 정보">
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
              <ModalField label="추가 강사">
                {editMode ? (
                  <CoTrainerPicker
                    staffList={staff}
                    primaryId={trainerMemberId || ""}
                    value={coTrainerIds}
                    onChange={setCoTrainerIds}
                  />
                ) : (
                  coTrainerNames || "—"
                )}
              </ModalField>
              <ModalField label="판매자">
                {editMode ? (
                  <select value={sellerMemberId} onChange={(e) => setSellerMemberId(Number(e.target.value))} className={crmInputClass}>
                    <option value={0}>선택</option>
                    {activeStaff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.display_name}
                      </option>
                    ))}
                  </select>
                ) : (
                  sellerName
                )}
              </ModalField>
              <div className="grid grid-cols-2 gap-3">
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
              </div>
              <ModalField label="회당 시간">
                {editMode ? (
                  <div className="relative">
                    <input type="number" min={0} step={5} value={sessionMinutes} onChange={(e) => setSessionMinutes(Number(e.target.value))} className={`${crmInputClass} pr-9`} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] text-[#A89B80]">분</span>
                  </div>
                ) : (
                  `${pass.session_minutes}분`
                )}
              </ModalField>
            </InfoPanel>

            <InfoPanel title="결제 및 만료">
              <ModalField label="금액">
                {editMode ? (
                  <div className="space-y-1.5">
                    <div className="relative">
                      <input
                        inputMode="numeric"
                        value={priceWon ? formatWon(priceWon) : ""}
                        onChange={(e) => setPriceWon(parseWon(e.target.value))}
                        className={`${crmInputClass} pr-9`}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] text-[#A89B80]">원</span>
                    </div>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={vatIncluded}
                        onChange={(e) => setVatIncluded(e.target.checked)}
                        className="w-4 h-4 accent-[#6B7B3A]"
                      />
                      <span className="text-[12.5px] text-[#3A342A] dark:text-zinc-300">부가세 포함 금액</span>
                    </label>
                  </div>
                ) : (
                  <span>
                    {formatWon(pass.price_won)}원
                    <span className="ml-1 text-[11.5px] text-[#A89B80]">
                      {pass.vat_included ? "부가세 포함" : "부가세 없음"}
                    </span>
                  </span>
                )}
              </ModalField>
              <ModalField label="회당 수업료">
                {(() => {
                  const price = editMode ? priceWon : pass.price_won;
                  const sessions = editMode ? totalSessions : pass.total_sessions;
                  const vat = editMode ? vatIncluded : pass.vat_included;
                  // 부가세 포함 결제면 10% 제외한 실수업료 기준으로 회당 단가 계산
                  const base = vat ? price / 1.1 : price;
                  const per = sessions > 0 ? Math.round(base / sessions) : Math.round(base);
                  return (
                    <span>
                      {formatWon(per)}원
                      <span className="ml-1 text-[11.5px] text-[#A89B80]">
                        {vat ? "부가세 제외" : "부가세 없음"}
                      </span>
                    </span>
                  );
                })()}
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
                  <span className="inline-flex items-center gap-2">
                    {pass.expires_at === "9999-12-31" ? "무기한" : pass.expires_at}
                    {pass.expires_at !== "9999-12-31" && (
                      <ExpiryBadge expiresAt={pass.expires_at} status={pass.status} />
                    )}
                  </span>
                )}
              </ModalField>
            </InfoPanel>
          </div>

          <InfoPanel title="메모">
            {editMode ? (
              <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} className={crmInputClass} />
            ) : (
              <div className="whitespace-pre-wrap text-[13.5px] text-[#3A342A] dark:text-zinc-200 min-h-[40px]">
                {pass.memo || <span className="text-[#A89B80]">—</span>}
              </div>
            )}
          </InfoPanel>

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
  tone?: "green" | "blue" | "gold" | "dark" | "red";
}) {
  const cls =
    tone === "blue"
      ? "bg-[#EFF7F8] text-[#315F7A] border-[#D7E7EA]"
      : tone === "gold"
      ? "bg-[#FFF8E6] text-[#826424] border-[#EAD9AA]"
      : tone === "dark"
      ? "bg-[#F4F1EA] text-[#2A251D] border-[#DDD3C2]"
      : tone === "red"
      ? "bg-red-50 text-red-700 border-red-100"
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

/** 추가 강사(공동 진행) 다중 선택 — 칩 + 드롭다운으로 추가/삭제 */
function CoTrainerPicker({
  staffList,
  primaryId,
  value,
  onChange,
}: {
  staffList: { id: number; display_name: string; role: string; status: string }[];
  primaryId: number | "";
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const nameOf = (id: number) => staffList.find((s) => s.id === id)?.display_name ?? `#${id}`;
  const selectable = staffList.filter(
    (s) => s.status === "active" && s.id !== primaryId && !value.includes(s.id)
  );
  return (
    <div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#6B7B3A]/12 text-[#4d5a28] dark:text-[#A8B87A] text-[12px]"
            >
              {nameOf(id)}
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v !== id))}
                className="text-[#8C8270] hover:text-red-600"
                title="제거"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <select
        value=""
        onChange={(e) => {
          const id = Number(e.target.value);
          if (id) onChange([...value, id]);
        }}
        className={crmInputClass}
        disabled={selectable.length === 0}
      >
        <option value="">
          {selectable.length === 0 ? "추가할 강사 없음" : "+ 추가 강사 선택"}
        </option>
        {selectable.map((s) => (
          <option key={s.id} value={s.id}>
            {s.display_name} ({s.role})
          </option>
        ))}
      </select>
    </div>
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
