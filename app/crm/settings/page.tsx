"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/auth-provider";
import { CrmModal, CrmField } from "../_components/crm-modal";
import { crmInputClass } from "../_components/crm-modal";
import { CONTRACT_CATEGORY_LABEL } from "../_components/crm-labels";
import {
  ContractSectionsEditor,
  ContractSection,
} from "../_components/contract-sections-editor";

interface Settings {
  center_id: number;
  cancel_hours: number;
  member_can_self_cancel_consumed: boolean;
  booking_unit_min: number;
  booking_horizon_days: number;
  notify_cancel: boolean;
  notify_change: boolean;
  notify_attend: boolean;
  notify_register: boolean;
  notify_pass_issue: boolean;
  working_hours_start: string;
  working_hours_end: string;
  default_columns: number;
}

interface AuditLog {
  id: number;
  actor_uid: string;
  action: string;
  entity_type: string;
  entity_id: number | null;
  payload: unknown;
  created_at: string;
}

const ACTION_LABEL: Record<string, string> = {
  "staff.add": "직원 추가",
  "staff.update": "직원 정보 수정",
  "staff.permissions.update": "직원 권한 수정",
  "staff.reactivate": "직원 재등록",
  "member.create": "회원 등록",
  "member.delete": "회원 삭제",
  "pass.issue": "수강권 발급",
  "pass.refund": "수강권 환불",
  "reservation.cancelled": "예약 취소",
  "reservation.noshow": "노쇼 처리",
  "settings.update": "설정 변경",
  "contract.create": "계약서 추가",
  "contract.delete": "계약서 삭제",
  "locker_zone.update": "락커 구역 설정 변경",
  "membership.issue": "회원권 발급",
  "membership.refund": "회원권 환불",
  "payout_rule.create": "정산 규칙 추가",
  "attendance.check_in": "출석 체크인",
  "measurement.create": "신체 측정 기록",
  "assign": "락커 배정",
  "return": "락커 회수",
  "move": "락커 이동",
  "broken": "락커 고장 처리",
  "repaired": "락커 수리 완료",
  "grade.create": "등급 추가",
  "grade.update": "등급 수정",
  "grade.delete": "등급 삭제",
  "center.transfer": "센터 양도",
};

const BASE_ROLE_LABEL: Record<string, string> = {
  owner: "대표자",
  admin: "관리자",
  manager: "팀장",
  trainer: "강사",
};

interface BootstrapInfo {
  role: "owner" | "admin" | "manager" | "trainer";
  centerName: string;
  businessNo: string | null;
}

export default function CrmSettingsPage() {
  const router = useRouter();
  const { getIdToken } = useAuth();
  const [tab, setTab] = useState<"reservation" | "alerts" | "grades" | "payout" | "contracts" | "logs" | "danger">("reservation");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [info, setInfo] = useState<BootstrapInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const [a, b] = await Promise.all([
        fetch("/api/crm/settings", {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        fetch("/api/crm/bootstrap", {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
      ]);
      const data = await a.json();
      if (!a.ok) throw new Error(data?.error || "조회 실패");
      setSettings(data.settings);
      if (b.ok) {
        const bi = await b.json();
        setInfo({ role: bi.role, centerName: bi.centerName, businessNo: bi.businessNo ?? null });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab !== "logs") return;
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/crm/audit-logs?limit=80", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs ?? []);
      }
    })();
  }, [tab, getIdToken]);

  const save = async (patch: Partial<Settings>) => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/settings", {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
      setSettings((cur) => (cur ? { ...cur, ...patch } : cur));
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-3xl mx-auto">
      <header className="mb-5">
        <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
          설정
        </h1>
        <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
          예약·취소 정책, 알림, 활동 로그를 관리해요.
        </p>
      </header>

      <div className="mb-5 flex gap-1.5 border-b border-[#E8E0D0] dark:border-zinc-800 overflow-x-auto">
        <TabBtn active={tab === "reservation"} onClick={() => setTab("reservation")}>
          예약 정책
        </TabBtn>
        <TabBtn active={tab === "alerts"} onClick={() => setTab("alerts")}>
          알림
        </TabBtn>
        <TabBtn active={tab === "grades"} onClick={() => setTab("grades")}>
          등급 관리
        </TabBtn>
        <TabBtn active={tab === "payout"} onClick={() => setTab("payout")}>
          정산 규칙
        </TabBtn>
        <TabBtn active={tab === "contracts"} onClick={() => setTab("contracts")}>
          계약서 관리
        </TabBtn>
        <TabBtn active={tab === "logs"} onClick={() => setTab("logs")}>
          활동 로그
        </TabBtn>
        <TabBtn active={tab === "danger"} onClick={() => setTab("danger")} danger>
          센터 탈퇴
        </TabBtn>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading && !settings && (
        <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
      )}

      {settings && tab === "reservation" && (
        <div className="space-y-4">
          <Card title="예약 취소">
            <Field
              label="회원의 예약 취소 가능 시간"
              hint="수업 시작 N시간 전까지 회원이 직접 예약을 취소할 수 있어요. 0이면 수업 전날까지만 가능."
            >
              <input
                type="number"
                min={0}
                max={72}
                value={settings.cancel_hours}
                onChange={(e) => save({ cancel_hours: Number(e.target.value) })}
                className={`${crmInputClass} max-w-[140px]`}
              />
              <span className="ml-2 text-[12.5px] text-[#A89B80]">시간</span>
            </Field>
            <Toggle
              label="가능 시간 이후에도 회원이 직접 차감 취소(노쇼) 가능"
              on={settings.member_can_self_cancel_consumed}
              onChange={(v) => save({ member_can_self_cancel_consumed: v })}
            />
          </Card>

          <Card title="예약 요청">
            <Field label="예약 시간 단위">
              <div className="flex gap-2">
                {[30, 60].map((n) => (
                  <button
                    key={n}
                    onClick={() => save({ booking_unit_min: n })}
                    className={segCls(settings.booking_unit_min === n)}
                  >
                    {n}분
                  </button>
                ))}
              </div>
            </Field>
            <Field label="예약 가능 기간" hint="오늘부터 N일 이후까지 회원이 예약 가능">
              <input
                type="number"
                min={1}
                max={365}
                value={settings.booking_horizon_days}
                onChange={(e) => save({ booking_horizon_days: Number(e.target.value) })}
                className={`${crmInputClass} max-w-[140px]`}
              />
              <span className="ml-2 text-[12.5px] text-[#A89B80]">일</span>
            </Field>
          </Card>

          <Card title="스케줄 표시">
            <Field label="근무 시작/종료">
              <input
                type="time"
                value={settings.working_hours_start.slice(0, 5)}
                onChange={(e) => save({ working_hours_start: e.target.value })}
                className={`${crmInputClass} max-w-[140px] inline-block`}
              />
              <span className="mx-2 text-[#A89B80]">~</span>
              <input
                type="time"
                value={settings.working_hours_end.slice(0, 5)}
                onChange={(e) => save({ working_hours_end: e.target.value })}
                className={`${crmInputClass} max-w-[140px] inline-block`}
              />
            </Field>
            <Field label="스케줄 컬럼 폭 (기본)">
              <input
                type="number"
                min={1}
                max={10}
                value={settings.default_columns}
                onChange={(e) => save({ default_columns: Number(e.target.value) })}
                className={`${crmInputClass} max-w-[140px]`}
              />
            </Field>
          </Card>
        </div>
      )}

      {settings && tab === "alerts" && (
        <Card title="단체 채팅 알림">
          <Toggle
            label="예약 취소 알림"
            on={settings.notify_cancel}
            onChange={(v) => save({ notify_cancel: v })}
          />
          <Toggle
            label="예약 변경 알림"
            on={settings.notify_change}
            onChange={(v) => save({ notify_change: v })}
          />
          <Toggle
            label="출석 완료 알림"
            on={settings.notify_attend}
            onChange={(v) => save({ notify_attend: v })}
          />
          <Toggle
            label="회원 등록 알림"
            on={settings.notify_register}
            onChange={(v) => save({ notify_register: v })}
          />
          <Toggle
            label="수강권 발급 알림"
            on={settings.notify_pass_issue}
            onChange={(v) => save({ notify_pass_issue: v })}
          />
        </Card>
      )}

      {tab === "grades" && <GradesPanel />}

      {tab === "payout" && <PayoutRulesPanel />}

      {tab === "contracts" && <ContractTemplatesPanel />}

      {tab === "logs" && (
        <Card title="최근 활동 (최대 80건)">
          {logs.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12.5px] text-[#8C8270]">
              아직 활동 기록이 없습니다.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="flex items-baseline justify-between gap-3 py-1.5 border-b border-[#E8E0D0]/40 dark:border-zinc-800/40 last:border-0 text-[12.5px]"
                >
                  <span className="text-[#3A342A] dark:text-zinc-300">
                    {ACTION_LABEL[log.action] ?? log.action}
                  </span>
                  <span className="text-[#A89B80] dark:text-zinc-500 shrink-0">
                    {formatDateTime(log.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "danger" && (
        <section className="px-4 py-4 rounded-2xl border-2 border-red-200 dark:border-red-900/60 bg-red-50/40 dark:bg-red-950/20">
          <h2 className="text-[14.5px] font-bold text-red-700 dark:text-red-300 mb-1.5">
            센터 탈퇴 / 양도
          </h2>
          <p className="text-[12.5px] text-red-700/80 dark:text-red-300/80 leading-relaxed">
            <strong>센터 탈퇴</strong>는 모든 회원·수강권·예약·직원·설정 정보를 영구 삭제하고 되돌릴 수 없어요.
            <br />
            <strong>센터 양도</strong>는 다른 분께 운영권을 넘기는 거예요. 양도하면 본인은 관리자로 강등됩니다.
          </p>

          {info?.role === "owner" ? (
            <div className="mt-3.5 flex flex-wrap gap-2">
              <button
                onClick={() => setWithdrawOpen(true)}
                className="px-4 py-2.5 rounded-lg bg-red-600 text-white text-[13.5px] font-semibold hover:bg-red-700 transition-colors"
              >
                센터 탈퇴
              </button>
              <button
                onClick={() => setTransferOpen(true)}
                className="px-4 py-2.5 rounded-lg bg-[#6B7B3A] text-white text-[13.5px] font-semibold hover:bg-[#5a6932] transition-colors"
              >
                센터 양도
              </button>
            </div>
          ) : (
            <div className="mt-3.5 px-3 py-2.5 rounded-lg bg-white/60 dark:bg-zinc-900/60 border border-red-200/60 dark:border-red-900/40 text-[12.5px] text-red-700/80 dark:text-red-300/80">
              대표자만 센터를 탈퇴·양도할 수 있어요.
            </div>
          )}
        </section>
      )}

      <WithdrawModal
        open={withdrawOpen}
        centerName={info?.centerName ?? ""}
        businessNo={info?.businessNo ?? null}
        onClose={() => setWithdrawOpen(false)}
        onConfirm={async (typedBusinessNo) => {
          const token = await getIdToken();
          if (!token) {
            alert("로그인 정보를 확인할 수 없습니다");
            return;
          }
          const res = await fetch("/api/crm/centers/me", {
            method: "DELETE",
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            body: JSON.stringify(
              typedBusinessNo !== null ? { business_no: typedBusinessNo } : {}
            ),
          });
          const data = await res.json();
          if (!res.ok) {
            alert(data?.error || "탈퇴 실패");
            return;
          }
          router.replace("/crm");
        }}
      />

      <TransferModal
        open={transferOpen}
        centerName={info?.centerName ?? ""}
        onClose={() => setTransferOpen(false)}
        onTransferred={(newOwnerName) => {
          setTransferOpen(false);
          alert(`${newOwnerName} 님께 센터 운영권을 양도했습니다. 본인은 관리자로 강등되었어요.`);
          router.replace("/crm/dashboard");
        }}
      />
    </div>
  );
}

interface Grade {
  id: number;
  base_role: string;
  label: string;
  is_system: boolean;
  sort_order: number;
}

function GradesPanel() {
  const { getIdToken } = useAuth();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 신규 등급 폼
  const [newLabel, setNewLabel] = useState("");
  const [newBase, setNewBase] = useState<"owner" | "admin" | "manager" | "trainer">("trainer");
  const [adding, setAdding] = useState(false);

  // 라벨 인라인 편집
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch("/api/crm/grades", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setGrades(data.grades ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  const addGrade = async () => {
    if (adding) return;
    if (!newLabel.trim()) {
      setError("등급 이름을 입력해 주세요");
      return;
    }
    setAdding(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/grades", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ label: newLabel.trim(), base_role: newBase }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "추가 실패");
      setNewLabel("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setAdding(false);
    }
  };

  const saveLabel = async (id: number) => {
    const v = editingLabel.trim();
    if (!v) return;
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/grades/${id}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ label: v }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "수정 실패");
      setEditingId(null);
      setEditingLabel("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    }
  };

  const deleteGrade = async (g: Grade) => {
    if (!window.confirm(`"${g.label}" 등급을 삭제할까요?`)) return;
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/grades/${g.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "삭제 실패");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    }
  };

  return (
    <Card title="직원 등급">
      <p className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed -mt-1 mb-3">
        센터에서 사용하는 직원 등급을 관리해요. 기본 4개 등급은 이름을 바꿀 수는 있지만 삭제할 수 없어요. 권한 게이트는 등급의 <strong>기본 분류</strong>(대표자/관리자/팀장/강사)에 따라 동작합니다.
      </p>

      {loading ? (
        <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : (
        <ul className="space-y-1.5">
          {grades.map((g) => (
            <li
              key={g.id}
              className="flex items-center justify-between gap-2 py-1.5 border-b border-[#E8E0D0]/40 dark:border-zinc-800/40 last:border-0"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {editingId === g.id ? (
                  <>
                    <input
                      className={`${crmInputClass} flex-1`}
                      value={editingLabel}
                      onChange={(e) => setEditingLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveLabel(g.id);
                        if (e.key === "Escape") {
                          setEditingId(null);
                          setEditingLabel("");
                        }
                      }}
                      autoFocus
                    />
                  </>
                ) : (
                  <>
                    <span className="text-[13.5px] font-medium text-[#2A251D] dark:text-zinc-100 truncate">
                      {g.label}
                    </span>
                    <span className="text-[11px] text-[#A89B80] shrink-0">
                      {BASE_ROLE_LABEL[g.base_role] ?? g.base_role} 기반
                      {g.is_system && <span className="ml-1 text-[#6B7B3A]">· 기본</span>}
                    </span>
                  </>
                )}
              </div>
              <div className="flex gap-1.5 shrink-0">
                {editingId === g.id ? (
                  <>
                    <button
                      onClick={() => saveLabel(g.id)}
                      className="px-2.5 py-1 rounded-md bg-[#6B7B3A] text-white text-[12px] font-semibold"
                    >
                      저장
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(null);
                        setEditingLabel("");
                      }}
                      className="px-2.5 py-1 rounded-md border border-[#E8E0D0] dark:border-zinc-700 text-[12px] text-[#6B5D47] dark:text-zinc-400"
                    >
                      취소
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setEditingId(g.id);
                        setEditingLabel(g.label);
                      }}
                      className="px-2.5 py-1 rounded-md border border-[#E8E0D0] dark:border-zinc-700 text-[12px] text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
                    >
                      이름 변경
                    </button>
                    {!g.is_system && (
                      <button
                        onClick={() => deleteGrade(g)}
                        className="px-2.5 py-1 rounded-md border border-red-200 dark:border-red-900 text-[12px] text-red-700 dark:text-red-300 hover:bg-red-50"
                      >
                        삭제
                      </button>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 pt-3 border-t border-[#E8E0D0]/70 dark:border-zinc-800">
        <div className="text-[13px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-2">
          새 등급 추가
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            className={`${crmInputClass} flex-1 min-w-[140px]`}
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="예) 수석강사, 부원장"
            onKeyDown={(e) => {
              if (e.key === "Enter") addGrade();
            }}
          />
          <select
            className={crmInputClass}
            style={{ maxWidth: 140 }}
            value={newBase}
            onChange={(e) => setNewBase(e.target.value as typeof newBase)}
          >
            <option value="owner">대표자 기반</option>
            <option value="admin">관리자 기반</option>
            <option value="manager">팀장 기반</option>
            <option value="trainer">강사 기반</option>
          </select>
          <button
            onClick={addGrade}
            disabled={adding || !newLabel.trim()}
            className="px-4 rounded-lg bg-[#6B7B3A] disabled:opacity-60 text-white text-[13px] font-semibold hover:bg-[#5a6932] whitespace-nowrap"
          >
            {adding ? "추가 중…" : "추가"}
          </button>
        </div>
        <p className="mt-1.5 text-[11.5px] text-[#A89B80] leading-relaxed">
          기반 등급에 따라 권한이 결정돼요. 이름은 자유롭게 지을 수 있고, 같은 이름은 중복으로 추가할 수 없어요.
        </p>
      </div>

      {error && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
    </Card>
  );
}

interface PayoutRule {
  id: number;
  target_member_id: number | null;
  mode: "rate" | "flat";
  tier_index: number;
  min_pass_price_won: number;
  max_pass_price_won: number | null;
  new_member_value: number;
  renewal_value: number;
  trial_value: number;
}

function PayoutRulesPanel() {
  const { getIdToken } = useAuth();
  const [rules, setRules] = useState<PayoutRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 새 룰 폼
  const [mode, setMode] = useState<"rate" | "flat">("rate");
  const [minPrice, setMinPrice] = useState("0");
  const [maxPrice, setMaxPrice] = useState("");
  const [newVal, setNewVal] = useState("50");
  const [renewalVal, setRenewalVal] = useState("50");
  const [trialVal, setTrialVal] = useState("50");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch("/api/crm/payout-rules", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setRules(data.rules ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (adding) return;
    setAdding(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/payout-rules", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          target_member_id: null,
          mode,
          tier_index: rules.length,
          min_pass_price_won: Number(minPrice) || 0,
          max_pass_price_won: maxPrice ? Number(maxPrice) : null,
          new_member_value: Number(newVal) || 0,
          renewal_value: Number(renewalVal) || 0,
          trial_value: Number(trialVal) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "추가 실패");
      setMinPrice("0");
      setMaxPrice("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm("이 룰을 삭제할까요?")) return;
    const token = await getIdToken();
    const res = await fetch(`/api/crm/payout-rules/${id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.ok) load();
  };

  const fmtMoney = (n: number) => n.toLocaleString("ko-KR");

  return (
    <Card title="센터 기본 정산 규칙">
      <p className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed -mt-1 mb-3">
        강사 수강권 매출에서 지급할 금액을 가격 구간별로 정의해요. <strong>정률제</strong>는 백분율(%), <strong>정액제</strong>는 세션당 고정 금액(원). 강사별 별도 규칙은 추후 강사 상세 페이지에서 설정.
      </p>

      {loading ? (
        <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : rules.length === 0 ? (
        <div className="px-3 py-4 text-center text-[12.5px] text-[#8C8270] border border-dashed border-[#E8E0D0] rounded-lg mb-3">
          등록된 정산 규칙이 없어요. 아래 폼에서 추가해 주세요.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#E8E0D0] dark:border-zinc-800 mb-3">
          <table className="w-full text-[12.5px]">
            <thead className="bg-[#FBF7EB] dark:bg-zinc-900/80 text-[#6B5D47] dark:text-zinc-400">
              <tr>
                <th className="text-left px-3 py-2 font-medium">방식</th>
                <th className="text-left px-3 py-2 font-medium">가격 구간 (원)</th>
                <th className="text-left px-3 py-2 font-medium">신규</th>
                <th className="text-left px-3 py-2 font-medium">재등록</th>
                <th className="text-left px-3 py-2 font-medium">체험</th>
                <th className="text-right px-3 py-2 font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-t border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
                  <td className="px-3 py-2 font-semibold">
                    {r.mode === "rate" ? "정률제" : "정액제"}
                  </td>
                  <td className="px-3 py-2 text-[#6B5D47] dark:text-zinc-400">
                    {fmtMoney(r.min_pass_price_won)} ~{" "}
                    {r.max_pass_price_won ? fmtMoney(r.max_pass_price_won) : "∞"}
                  </td>
                  <td className="px-3 py-2">
                    {r.new_member_value}
                    {r.mode === "rate" ? "%" : "원"}
                  </td>
                  <td className="px-3 py-2">
                    {r.renewal_value}
                    {r.mode === "rate" ? "%" : "원"}
                  </td>
                  <td className="px-3 py-2">
                    {r.trial_value}
                    {r.mode === "rate" ? "%" : "원"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => remove(r.id)}
                      className="px-2 py-0.5 rounded text-[11.5px] border border-red-200 text-red-700 hover:bg-red-50"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="pt-3 border-t border-[#E8E0D0]/70 dark:border-zinc-800">
        <div className="text-[13px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-2">
          새 규칙 추가
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <select
            className={crmInputClass}
            value={mode}
            onChange={(e) => setMode(e.target.value as "rate" | "flat")}
          >
            <option value="rate">정률제 (%)</option>
            <option value="flat">정액제 (원)</option>
          </select>
          <input
            className={crmInputClass}
            placeholder="최소 가격"
            inputMode="numeric"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value.replace(/\D/g, ""))}
          />
          <input
            className={crmInputClass}
            placeholder="최대 가격 (빈칸=무한)"
            inputMode="numeric"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value.replace(/\D/g, ""))}
          />
          <input
            className={crmInputClass}
            placeholder="신규"
            inputMode="numeric"
            value={newVal}
            onChange={(e) => setNewVal(e.target.value.replace(/\D/g, ""))}
          />
          <input
            className={crmInputClass}
            placeholder="재등록"
            inputMode="numeric"
            value={renewalVal}
            onChange={(e) => setRenewalVal(e.target.value.replace(/\D/g, ""))}
          />
          <input
            className={crmInputClass}
            placeholder="체험"
            inputMode="numeric"
            value={trialVal}
            onChange={(e) => setTrialVal(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <button
          onClick={add}
          disabled={adding}
          className="mt-2 px-4 py-2 rounded-lg bg-[#6B7B3A] disabled:opacity-60 text-white text-[13px] font-semibold hover:bg-[#5a6932]"
        >
          {adding ? "추가 중…" : "규칙 추가"}
        </button>
      </div>

      {error && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-red-50 text-[13px] text-red-700">{error}</div>
      )}
    </Card>
  );
}

function TransferModal({
  open,
  centerName,
  onClose,
  onTransferred,
}: {
  open: boolean;
  centerName: string;
  onClose: () => void;
  onTransferred: (newOwnerName: string) => void;
}) {
  const { getIdToken } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { firebase_uid: string; name: string; email: string | null }[]
  >([]);
  const [picked, setPicked] = useState<{
    firebase_uid: string;
    name: string;
    email: string | null;
  } | null>(null);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setPicked(null);
      setSearched(false);
      setError("");
      setSubmitting(false);
    }
  }, [open]);

  const search = async () => {
    const q = query.trim();
    setError("");
    if (!q) {
      setResults([]);
      setSearched(false);
      return;
    }
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      setSearching(true);
      const res = await fetch(`/api/crm/users/lookup?q=${encodeURIComponent(q)}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "검색 실패");
      setResults(data.users ?? []);
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSearching(false);
    }
  };

  const confirm = async () => {
    if (!picked || submitting) return;
    if (!window.confirm(`${picked.name} 님께 센터 운영권을 양도하시겠어요?\n양도 후 본인은 관리자로 강등됩니다.`)) {
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/centers/me/transfer", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ firebase_uid: picked.firebase_uid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "양도 실패");
      onTransferred(data.newOwnerName ?? picked.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CrmModal open={open} onClose={submitting ? () => {} : onClose} title="센터 양도" size="lg">
      <div className="space-y-3.5">
        <div className="px-3.5 py-2.5 rounded-lg bg-[#FBF7EB] dark:bg-zinc-900/60 border border-[#E8E0D0]/70 dark:border-zinc-800 text-[12.5px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed">
          <strong className="text-[#3A342A] dark:text-zinc-200">{centerName || "센터"}</strong>의 운영권을 다른 분께 넘깁니다. 양도 후 본인은 자동으로 관리자로 강등되며, 데이터 접근은 계속 가능해요.
        </div>

        {picked ? (
          <div className="px-4 py-3 rounded-xl border border-[#6B7B3A]/50 bg-[#6B7B3A]/5 dark:bg-[#6B7B3A]/15 flex items-start justify-between gap-3">
            <div>
              <div className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">
                {picked.name}
              </div>
              {picked.email && (
                <div className="text-[11.5px] text-[#6B5D47] dark:text-zinc-400 mt-0.5">
                  {picked.email}
                </div>
              )}
            </div>
            <button
              onClick={() => setPicked(null)}
              disabled={submitting}
              className="text-[12.5px] text-[#6B7B3A] dark:text-[#A8B87A] hover:underline shrink-0"
            >
              다시 선택
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    search();
                  }
                }}
                placeholder="닉네임 또는 이메일"
                className={`${crmInputClass} flex-1`}
                autoFocus
              />
              <button
                type="button"
                onClick={search}
                disabled={searching || !query.trim()}
                className="px-4 rounded-lg bg-[#6B7B3A] disabled:opacity-60 text-white text-[13px] font-semibold hover:bg-[#5a6932] whitespace-nowrap"
              >
                {searching ? "검색 중…" : "검색"}
              </button>
            </div>
            <p className="text-[11.5px] text-[#A89B80] leading-relaxed">
              닉네임은 일부만 입력해도 검색되고, 이메일은 정확히 입력하면 바로 찾을 수 있어요.
            </p>

            {searched && results.length === 0 && (
              <div className="px-4 py-5 text-center text-[12.5px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-lg">
                일치하는 사용자가 없습니다.
              </div>
            )}
            {results.length > 0 && (
              <ul className="space-y-1.5 max-h-[260px] overflow-y-auto">
                {results.map((u) => (
                  <li key={u.firebase_uid}>
                    <button
                      type="button"
                      onClick={() => setPicked(u)}
                      className="w-full text-left px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 hover:border-[#6B7B3A]/50"
                    >
                      <div className="text-[13.5px] font-medium text-[#2A251D] dark:text-zinc-100">
                        {u.name}
                      </div>
                      {u.email && (
                        <div className="text-[11.5px] text-[#A89B80] truncate">
                          {u.email}
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13.5px] font-semibold text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={confirm}
            disabled={!picked || submitting}
            className="flex-1 px-4 py-2.5 rounded-lg bg-[#6B7B3A] disabled:bg-[#A8B87A]/40 text-white text-[13.5px] font-semibold hover:bg-[#5a6932]"
          >
            {submitting ? "양도 중…" : "센터 양도"}
          </button>
        </div>
      </div>
    </CrmModal>
  );
}

function WithdrawModal({
  open,
  centerName,
  businessNo,
  onClose,
  onConfirm,
}: {
  open: boolean;
  centerName: string;
  businessNo: string | null;
  onClose: () => void;
  onConfirm: (typedBusinessNo: string | null) => Promise<void>;
}) {
  const [typedName, setTypedName] = useState("");
  const [typedBiz, setTypedBiz] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setTypedName("");
      setTypedBiz("");
      setSubmitting(false);
    }
  }, [open]);

  const expectedName = (centerName || "").trim();
  const expectedBiz = (businessNo || "").replace(/[\s-]/g, "");
  const requireBiz = expectedBiz.length > 0;

  const nameMatches = expectedName.length > 0 && typedName.trim() === expectedName;
  const bizMatches =
    !requireBiz || typedBiz.replace(/[\s-]/g, "") === expectedBiz;
  const matches = nameMatches && bizMatches;

  const handleConfirm = async () => {
    if (!matches || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(requireBiz ? typedBiz.trim() : null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CrmModal open={open} onClose={submitting ? () => {} : onClose} title="정말 센터를 탈퇴하시겠어요?">
      <div className="space-y-3.5">
        <div className="px-3.5 py-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200/60 dark:border-red-900/40">
          <p className="text-[13px] font-semibold text-red-700 dark:text-red-300">
            탈퇴하면 아래 정보가 모두 영구 삭제됩니다.
          </p>
          <ul className="mt-2 space-y-0.5 text-[12.5px] text-red-700/80 dark:text-red-300/80 list-disc list-inside">
            <li>회원 명단과 메모</li>
            <li>발급한 모든 수강권 내역</li>
            <li>예약·출석·노쇼 기록</li>
            <li>가입한 강사·직원 정보</li>
            <li>센터 설정과 정산 규칙</li>
            <li>활동 로그</li>
          </ul>
          <p className="mt-2 text-[12.5px] text-red-700 dark:text-red-300 font-semibold">
            이 작업은 되돌릴 수 없어요.
          </p>
        </div>

        <div>
          <label className="block text-[12.5px] text-[#3A342A] dark:text-zinc-300 mb-1.5">
            확인을 위해 센터 이름{" "}
            <span className="font-semibold text-red-700 dark:text-red-300">
              &ldquo;{expectedName}&rdquo;
            </span>{" "}
            을(를) 입력해 주세요.
          </label>
          <input
            type="text"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder={expectedName}
            className={crmInputClass}
            autoFocus
          />
        </div>

        {requireBiz && (
          <div>
            <label className="block text-[12.5px] text-[#3A342A] dark:text-zinc-300 mb-1.5">
              사업자 등록번호도 정확히 입력해 주세요.
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={typedBiz}
              onChange={(e) => setTypedBiz(e.target.value)}
              placeholder="000-00-00000"
              className={crmInputClass}
            />
            <p className="mt-1 text-[11.5px] text-[#A89B80]">
              하이픈은 있어도 없어도 OK. 등록된 번호와 일치해야 탈퇴됩니다.
            </p>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13.5px] font-semibold text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={handleConfirm}
            disabled={!matches || submitting}
            className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 disabled:bg-red-300 dark:disabled:bg-red-900/40 text-white text-[13.5px] font-semibold hover:bg-red-700"
          >
            {submitting ? "탈퇴 중…" : "센터 탈퇴"}
          </button>
        </div>
      </div>
    </CrmModal>
  );
}

/* ─── 계약서 양식 관리 패널 ──────────────────────── */

type ContractCategory = "purchase" | "transfer" | "refund" | "employment" | "etc";

interface ContractTemplate {
  id: number;
  category: ContractCategory;
  title: string;
  created_at: string;
  updated_at: string;
}

function ContractTemplatesPanel() {
  const { getIdToken } = useAuth();
  const [list, setList] = useState<ContractTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch("/api/crm/contracts?sort=name_asc", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setList(data.contracts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-[#6B5D47] dark:text-zinc-400">
          회원·직원과 체결할 계약서 양식을 작성하고 관리해요.
        </p>
        <button
          onClick={() => setCreateOpen(true)}
          className="px-3 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932] whitespace-nowrap"
        >
          + 새 양식 작성
        </button>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : list.length === 0 ? (
        <div className="px-4 py-10 text-center text-[13px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
          등록된 양식이 없어요. + 새 양식 작성 으로 시작해 보세요.
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => setEditId(t.id)}
                className="w-full text-left px-4 py-3 rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 hover:border-[#6B7B3A]/50 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">
                    {t.title}
                  </span>
                  <span className="shrink-0 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#F5F0E5] text-[#6B5D47]">
                    {CONTRACT_CATEGORY_LABEL[t.category] ?? t.category}
                  </span>
                </div>
                <div className="mt-1 text-[11.5px] text-[#A89B80]">
                  수정 {t.updated_at?.slice(0, 10)}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <ContractTemplateEditModal
        mode="create"
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false);
          load();
        }}
      />

      <ContractTemplateEditModal
        mode="edit"
        templateId={editId}
        open={editId !== null}
        onClose={() => setEditId(null)}
        onSaved={() => {
          setEditId(null);
          load();
        }}
        onDeleted={() => {
          setEditId(null);
          load();
        }}
      />
    </div>
  );
}

function ContractTemplateEditModal({
  mode,
  open,
  templateId,
  onClose,
  onSaved,
  onDeleted,
}: {
  mode: "create" | "edit";
  open: boolean;
  templateId?: number | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const { getIdToken } = useAuth();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("purchase");
  const [customCats, setCustomCats] = useState<{ id: number; key: string; label: string }[]>([]);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatLabel, setNewCatLabel] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const [sections, setSections] = useState<ContractSection[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setTitle("");
      setCategory("purchase");
      setSections([]);
      setNewCatOpen(false);
      setNewCatLabel("");
      setError("");
      return;
    }
    // 카테고리 로드
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/crm/contract-categories", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setCustomCats(data.categories ?? []);
      }
    })();
    if (mode === "edit" && templateId) {
      (async () => {
        setLoading(true);
        try {
          const token = await getIdToken();
          const res = await fetch(`/api/crm/contracts/${templateId}`, {
            headers: { authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          const data = await res.json();
          if (res.ok && data.contract) {
            setTitle(data.contract.title);
            setCategory(data.contract.category);
            const secs = Array.isArray(data.contract.sections) ? data.contract.sections : [];
            setSections(
              secs.map(
                (
                  s: { key?: string; title?: string; body?: string; required?: boolean },
                  i: number
                ) => ({
                  key: s.key || `s${i + 1}`,
                  title: s.title || "",
                  body: s.body || "",
                  required: s.required !== false,
                })
              )
            );
          } else {
            setError(data?.error || "조회 실패");
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : "네트워크 오류");
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [open, mode, templateId, getIdToken]);

  const addCategory = async () => {
    setError("");
    const label = newCatLabel.trim();
    if (!label) return setError("카테고리 이름을 입력해 주세요");
    setAddingCat(true);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/contract-categories", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "추가 실패");
      setCustomCats((prev) => [...prev, data.category]);
      setCategory(data.category.key);
      setNewCatLabel("");
      setNewCatOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setAddingCat(false);
    }
  };

  const submit = async () => {
    setError("");
    if (!title.trim()) return setError("제목을 입력해주세요");
    setSubmitting(true);
    try {
      const token = await getIdToken();
      const path =
        mode === "edit" && templateId
          ? `/api/crm/contracts/${templateId}`
          : "/api/crm/contracts";
      const method = mode === "edit" ? "PATCH" : "POST";
      const res = await fetch(path, {
        method,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim(), category, sections }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    if (!templateId) return;
    if (!window.confirm("이 양식을 삭제할까요?")) return;
    const token = await getIdToken();
    const res = await fetch(`/api/crm/contracts/${templateId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.ok) onDeleted?.();
  };

  return (
    <CrmModal
      open={open}
      onClose={onClose}
      title={mode === "edit" ? "양식 수정" : "새 양식 작성"}
      size="lg"
    >
      {loading ? (
        <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : (
        <div className="space-y-3">
          <CrmField label="카테고리" required>
            {newCatOpen ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  type="text"
                  value={newCatLabel}
                  onChange={(e) => setNewCatLabel(e.target.value.slice(0, 20))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCategory();
                    }
                    if (e.key === "Escape") {
                      setNewCatOpen(false);
                      setNewCatLabel("");
                    }
                  }}
                  placeholder="새 카테고리 이름"
                  className={`${crmInputClass} flex-1`}
                />
                <button
                  type="button"
                  onClick={addCategory}
                  disabled={addingCat || !newCatLabel.trim()}
                  className="px-3 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold disabled:opacity-60"
                >
                  {addingCat ? "…" : "추가"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewCatOpen(false);
                    setNewCatLabel("");
                  }}
                  className="px-2 py-2 rounded-lg text-[13px] text-[#6B5D47]"
                >
                  취소
                </button>
              </div>
            ) : (
              <select
                className={crmInputClass}
                value={category}
                onChange={(e) => {
                  if (e.target.value === "__add__") {
                    setNewCatOpen(true);
                  } else {
                    setCategory(e.target.value);
                  }
                }}
              >
                {(["purchase", "transfer", "refund", "employment", "etc"] as const).map((k) => (
                  <option key={k} value={k}>
                    {CONTRACT_CATEGORY_LABEL[k]}
                  </option>
                ))}
                {customCats.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
                <option value="__add__">+ 생성하기</option>
              </select>
            )}
          </CrmField>
          <CrmField label="제목" required>
            <input
              className={crmInputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예) 피티 회원가입 계약서"
              autoFocus
            />
          </CrmField>
          <CrmField label="내용 (섹션별)">
            <ContractSectionsEditor sections={sections} onChange={setSections} />
          </CrmField>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            {mode === "edit" && (
              <button
                type="button"
                onClick={remove}
                className="px-4 py-2.5 rounded-lg border border-red-200 text-red-700 text-[13px] font-semibold hover:bg-red-50"
              >
                삭제
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13.5px] font-semibold text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
            >
              취소
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="flex-1 px-4 py-2.5 rounded-lg bg-[#6B7B3A] disabled:opacity-60 text-white text-[13.5px] font-semibold hover:bg-[#5a6932]"
            >
              {submitting ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      )}
    </CrmModal>
  );
}

function TabBtn({
  active,
  onClick,
  children,
  danger,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  const activeColor = danger
    ? "border-red-500 text-red-600 dark:text-red-400"
    : "border-[#6B7B3A] text-[#6B7B3A] dark:text-[#A8B87A]";
  const inactiveColor = danger
    ? "border-transparent text-red-500/70 hover:text-red-600 dark:text-red-400/70 dark:hover:text-red-300"
    : "border-transparent text-[#8C8270] dark:text-zinc-500 hover:text-[#3A342A] dark:hover:text-zinc-300";
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 -mb-px text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap ${active ? activeColor : inactiveColor}`}
    >
      {children}
    </button>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-4 py-4 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 space-y-4">
      <h2 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[13px] font-medium text-[#3A342A] dark:text-zinc-300 mb-1.5">
        {label}
      </div>
      {children}
      {hint && <p className="mt-1.5 text-[11.5px] text-[#A89B80] leading-relaxed">{hint}</p>}
    </div>
  );
}

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between py-1">
      <span className="text-[13.5px] text-[#3A342A] dark:text-zinc-300">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!on)}
        className={`relative inline-flex w-10 h-6 rounded-full transition-colors
          ${on ? "bg-[#6B7B3A]" : "bg-[#E8E0D0] dark:bg-zinc-700"}`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform
            ${on ? "translate-x-[18px]" : "translate-x-0.5"}`}
        />
      </button>
    </label>
  );
}

function segCls(active: boolean) {
  return `px-3 py-2 rounded-lg text-[13px] font-medium border transition-colors
    ${active
      ? "border-[#6B7B3A] bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A]"
      : "border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300 hover:border-[#6B7B3A]/40"
    }`;
}

function formatDateTime(iso: string) {
  try {
    const d = new Date(iso);
    const k = new Date(d.getTime() + 9 * 3600 * 1000);
    const yyyy = k.getUTCFullYear();
    const mm = String(k.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(k.getUTCDate()).padStart(2, "0");
    const hh = String(k.getUTCHours()).padStart(2, "0");
    const mi = String(k.getUTCMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  } catch {
    return iso;
  }
}
