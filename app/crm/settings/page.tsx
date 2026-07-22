"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { CrmModal } from "../_components/crm-modal";
import { crmInputClass } from "../_components/crm-modal";
import { formatWon, parseWon, formatPhone } from "../_components/crm-labels";
import {
  PERMISSION_GROUPS,
  buildGradePermissionMatrix,
  type GradeMeta,
} from "../_components/role-permissions";
import CrmStaffPage from "../staff/page";
import CrmContractsPage from "../contracts/page";
import { useCrmTheme } from "../_components/crm-theme";

interface Settings {
  center_id: number;
  cancel_enabled: boolean;
  cancel_hours: number;
  booking_enabled: boolean;
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
  checkout_mileage_enabled: boolean;
  checkout_mileage_earn: number;
}

interface AuditLog {
  id: number;
  actor_uid: string;
  action: string;
  entity_type: string;
  entity_id: number | null;
  payload: unknown;
  created_at: string;
  /** 대상 회원 이름 (회원권/수강권/대여권/예약/회원 관련 로그) */
  subject_name?: string | null;
}

const ACTION_LABEL: Record<string, string> = {
  "staff.add": "직원 추가",
  "staff.update": "직원 정보 수정",
  "staff.permissions.update": "직원 권한 수정",
  "staff.reactivate": "직원 재등록",
  "member.create": "회원 등록",
  "member.delete": "회원 삭제",
  "attendance.cancel": "출석 취소",
  "member.face_register": "얼굴 등록",
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
  "grade_permission.update": "직급 권한 변경",
  "role_permission.update": "직급 권한 변경",
  "center.transfer": "센터 양도",
  "member.update": "회원 정보 수정",
  "membership.update": "회원권 수정",
  "pass.update": "수강권 수정",
  "rental.issue": "대여권 발급",
  "rental.update": "대여권 수정",
  "payment.create": "결제 기록 추가",
  "product.create": "상품 추가",
  "notice.create": "공지 등록",
  "message.broadcast": "메시지 발송",
  "schedule_event.create": "일정 등록",
  "reservation.reschedule": "예약 시간 변경",
  "pause.create": "홀딩(일시정지) 시작",
  "pause.cancel": "홀딩 취소",
  "fixed_expense.create": "고정 지출 추가",
  "vendor.create": "거래처 등록",
  "fixed_expense.update": "고정 지출 수정",
  "fixed_expense.delete": "고정 지출 삭제",
  "additional_expense.create": "추가 지출 추가",
  "additional_expense.update": "추가 지출 수정",
  "additional_expense.delete": "추가 지출 삭제",
  "locker_layout.save": "락커 배치 저장",
  "contract.request": "계약서 발송 요청",
  "contract.sign": "계약서 서명",
  "contract.void": "계약서 무효화",
  "members.bulk_extend": "회원 기간 일괄 연장",
  "members.bulk_hold": "회원 일괄 홀딩",
  "members.bulk_mileage": "회원 마일리지 일괄 지급",
};

const BASE_ROLE_LABEL: Record<string, string> = {
  owner: "대표자",
  admin: "관리자",
  manager: "팀장",
  trainer: "강사",
  fc: "FC",
  alba: "아르바이트",
};

// 활동 로그 payload → 사람이 읽는 한 줄 요약
const FIELD_LABEL: Record<string, string> = {
  price_won: "금액", discount_won: "할인", vat_included: "부가세포함",
  payment_method: "결제수단", seller_member_id: "담당자", trainer_member_id: "담당강사",
  co_trainer_ids: "추가강사", start_date: "시작일", expires_at: "만료일", purchased_at: "구매일",
  memo: "메모", lesson_kind: "수업종류", total_sessions: "총세션", remaining_sessions: "잔여세션",
  session_minutes: "수업시간(분)", checkout_mileage_enabled: "퇴실 마일리지", checkout_mileage_earn: "퇴실 적립P",
  cancel_hours: "취소 가능시간", booking_enabled: "예약", cancel_enabled: "취소",
  default_columns: "스케줄 열수", booking_unit_min: "예약단위(분)", booking_horizon_days: "예약가능일",
  notify_cancel: "취소알림", notify_change: "변경알림", notify_attend: "출석알림",
  notify_register: "등록알림", notify_pass_issue: "발급알림",
  working_hours_start: "운영시작", working_hours_end: "운영종료",
  label: "이름", base_role: "기본분류", amount_won: "금액", billing_day: "결제일",
  role: "등급", grade_id: "등급", access_level: "권한레벨", employment_status: "재직상태",
  employment_type: "근무형태", display_name: "이름", status: "상태", sort_order: "순서",
  audience_kind: "대상", recipient_count: "인원", ym: "귀속월", reason: "사유",
  requested_by: "요청자", days: "기간(일)", plan_name: "플랜", duration_days: "기간(일)",
  permission_key: "권한", enabled: "허용", role_key: "등급", title: "제목", category: "분류",
  name: "이름", phone: "연락처", password: "비밀번호", note: "메모",
};
function fmtLogVal(k: string, v: unknown): string {
  if (typeof v === "boolean") return v ? "켬" : "끔";
  if (Array.isArray(v)) return `${v.length}건`;
  if (v === null || v === undefined || v === "") return "없음";
  if (typeof v === "object") return "변경";
  if (k.endsWith("_id")) return "변경";
  if (typeof v === "number" && /won|earn|amount|price|paid/i.test(k)) return `${v.toLocaleString()}원`;
  return String(v);
}
function describeLog(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(p)) {
    if (k === "updated_at") continue;
    // 락커 등 { from, to } 변경 표기
    if (v && typeof v === "object" && !Array.isArray(v) && "to" in (v as Record<string, unknown>)) {
      const t = (v as { to?: unknown }).to;
      parts.push(`${FIELD_LABEL[k] ?? k} → ${fmtLogVal(k, t)}`);
    } else {
      parts.push(`${FIELD_LABEL[k] ?? k} ${fmtLogVal(k, v)}`);
    }
    if (parts.length >= 5) break;
  }
  return parts.join(", ");
}

interface BootstrapInfo {
  role: "owner" | "admin" | "manager" | "trainer";
  centerName: string;
  businessNo: string | null;
}

type SettingsTab =
  | "reservation"
  | "alerts"
  | "notices"
  | "mileage"
  | "center"
  | "permissions"
  | "staff"
  | "contracts"
  | "logs"
  | "expenses"
  | "vendors";

const SETTINGS_TABS: {
  key: SettingsTab;
  label: string;
  desc: string;
  icon: "calendar" | "bell" | "notice" | "point" | "badge" | "shield" | "card" | "vendor" | "danger" | "log";
  danger?: boolean;
}[] = [
  { key: "center", label: "센터 정보", desc: "주소·연락처·SNS", icon: "notice" },
  { key: "reservation", label: "예약 정책", desc: "예약·취소 기준", icon: "calendar" },
  { key: "alerts", label: "알림", desc: "채팅 알림", icon: "bell" },
  { key: "notices", label: "공지 설정", desc: "센터 공지", icon: "notice" },
  { key: "mileage", label: "마일리지", desc: "적립 정책", icon: "point" },
  { key: "permissions", label: "직급 권한", desc: "직원 등급·기능 접근", icon: "shield" },
  { key: "staff", label: "직원 관리", desc: "직원 등록·정산", icon: "badge" },
  { key: "contracts", label: "전자계약서", desc: "계약서 작성·발송", icon: "notice" },
  { key: "expenses", label: "고정 지출", desc: "월 지출", icon: "card" },
  { key: "vendors", label: "거래처", desc: "업체 관리", icon: "vendor" },
  { key: "logs", label: "활동 로그", desc: "변경 기록", icon: "log" },
];

export default function CrmSettingsPage() {
  const { getIdToken } = useAuth();
  const [tab, setTab] = useState<SettingsTab>(() => {
    if (typeof window === "undefined") return "reservation";
    const t = new URLSearchParams(window.location.search).get("tab");
    return t && SETTINGS_TABS.some((x) => x.key === t) ? (t as SettingsTab) : "reservation";
  });
  const { theme, setTheme } = useCrmTheme();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [info, setInfo] = useState<BootstrapInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const [a, b, c] = await Promise.all([
        fetch("/api/crm/settings", {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        fetch("/api/crm/bootstrap", {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        fetch("/api/crm/staff/requests?count=1", {
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
      if (c.ok) {
        const cc = await c.json();
        setPendingCount(cc.count ?? 0);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  // 직원관리 탭으로 이동하면 요청을 처리했을 수 있으니 배지 카운트 재조회
  useEffect(() => {
    if (tab !== "staff") return;
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/crm/staff/requests?count=1", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) {
        const d = await res.json();
        setPendingCount(d.count ?? 0);
      }
    })();
  }, [tab, getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  // 현재 탭을 URL(?tab=)에 반영 → 상세(직원·계약서 등)에서 뒤로가기 시 같은 탭으로 복귀
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (tab === "reservation") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url.toString());
  }, [tab]);

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
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-5xl mx-auto">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
            설정
          </h1>
          <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
            예약·취소 정책, 알림, 활동 로그를 관리해요.
          </p>
        </div>
        {/* CRM 화면 테마 (화이트/블랙) — 기기별 저장 */}
        <div className="shrink-0">
          <div className="text-[11.5px] text-[#8C8270] dark:text-zinc-500 mb-1 text-right">CRM 테마</div>
          <div className="inline-flex rounded-lg border border-[#E8E0D0] dark:border-zinc-700 overflow-hidden">
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={`px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                theme === "light"
                  ? "bg-[#6B7B3A] text-white"
                  : "bg-[#FEFCF7] dark:bg-zinc-900 text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
              }`}
            >
              ☀ 화이트
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={`px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                theme === "dark"
                  ? "bg-[#6B7B3A] text-white"
                  : "bg-[#FEFCF7] dark:bg-zinc-900 text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
              }`}
            >
              ☾ 블랙
            </button>
          </div>
        </div>
      </header>

      <div className="mb-5 overflow-x-auto">
        <div className="grid min-w-[860px] grid-cols-5 gap-2 rounded-xl border border-[#E4D9C6] bg-white/80 p-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          {SETTINGS_TABS.map((item) => (
            <TabBtn
              key={item.key}
              active={tab === item.key}
              onClick={() => setTab(item.key)}
              label={item.label}
              desc={item.desc}
              icon={item.icon}
              danger={item.danger}
              badge={item.key === "staff" ? pendingCount : 0}
            />
          ))}
        </div>
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
            <Toggle
              label="예약 취소 기능 사용"
              on={settings.cancel_enabled}
              onChange={(v) => save({ cancel_enabled: v })}
            />
            <p className="mt-1 mb-2 text-[11.5px] text-[#A89B80]">
              끄면 회원이 예약을 직접 취소할 수 없어요. 관리자만 취소 처리할 수 있습니다.
            </p>
            <div className={settings.cancel_enabled ? "" : "opacity-50 pointer-events-none"}>
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
              <p className="mt-1 text-[11.5px] text-[#A89B80] leading-relaxed">
                가능 시간이 지난 뒤에는 회원이 직접 취소할 수 없어요. 노쇼·차감 취소 처리는 강사·관리자만 스케줄에서 진행할 수 있습니다.
              </p>
            </div>
          </Card>

          <Card title="예약 요청">
            <Toggle
              label="예약 요청 기능 사용"
              on={settings.booking_enabled}
              onChange={(v) => save({ booking_enabled: v })}
            />
            <p className="mt-1 mb-2 text-[11.5px] text-[#A89B80]">
              끄면 회원이 예약 요청을 보낼 수 없어요. 관리자가 직접 예약을 등록해야 합니다.
            </p>
            <div className={settings.booking_enabled ? "" : "opacity-50 pointer-events-none"}>
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
            </div>
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

      {tab === "notices" && <NoticesPanel />}

      {settings && tab === "mileage" && (
        <div className="space-y-4">
          <p className="text-[13px] text-[#6B5D47] dark:text-zinc-400">
            회원용 앱에서 <strong>퇴실(체크아웃)</strong> 시 자동으로 적립할 마일리지를 설정해요.
          </p>

          <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5 space-y-4">
            <label className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">
                  퇴실 시 마일리지 적립
                </div>
                <div className="mt-0.5 text-[12px] text-[#8C8270] dark:text-zinc-500">
                  앱에서 퇴실할 때마다 아래 금액이 적립돼요.
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  save({ checkout_mileage_enabled: !settings.checkout_mileage_enabled })
                }
                disabled={saving}
                className={`relative inline-flex w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-60
                  ${settings.checkout_mileage_enabled ? "bg-[#6B7B3A]" : "bg-[#E8E0D0] dark:bg-zinc-700"}`}
                aria-pressed={settings.checkout_mileage_enabled}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform
                    ${settings.checkout_mileage_enabled ? "translate-x-[22px]" : "translate-x-0.5"}`}
                />
              </button>
            </label>

            {settings.checkout_mileage_enabled && (
              <div>
                <label className="block text-[12.5px] font-medium text-[#6B5D47] dark:text-zinc-400 mb-1.5">
                  퇴실 시 적립 마일리지 (P)
                </label>
                <div className="relative max-w-[200px]">
                  <input
                    type="number"
                    min={0}
                    defaultValue={settings.checkout_mileage_earn ?? 0}
                    key={`cm-${settings.checkout_mileage_earn}`}
                    onBlur={(e) => {
                      const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
                      if (v !== settings.checkout_mileage_earn) save({ checkout_mileage_earn: v });
                    }}
                    className={`${crmInputClass} pr-9`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#6B5D47] dark:text-zinc-400">
                    P
                  </span>
                </div>
                <p className="mt-1.5 text-[11.5px] text-[#A89B80] dark:text-zinc-500">
                  입력 후 다른 곳을 클릭하면 저장돼요. 1P = 1원 기준으로 회원 마일리지에 적립됩니다.
                </p>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "center" && <CenterProfilePanel role={info?.role ?? "trainer"} />}

      {tab === "permissions" && (
        <div className="space-y-6">
          <GradesPanel />
          <RolePermissionsPanel />
        </div>
      )}

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
                  <span className="min-w-0 text-[#3A342A] dark:text-zinc-300 truncate">
                    <span className="font-medium">{ACTION_LABEL[log.action] ?? log.action}</span>
                    {log.subject_name && (
                      <span className="font-semibold text-[#6B7B3A] dark:text-[#A8B87A]"> · {log.subject_name}</span>
                    )}
                    {(() => {
                      const d = describeLog(log.payload);
                      return d ? <span className="text-[#8C8270] dark:text-zinc-500"> · {d}</span> : null;
                    })()}
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

      {tab === "staff" && (
        <div className="-mx-5 md:-mx-8 -mt-2">
          <CrmStaffPage />
        </div>
      )}

      {tab === "contracts" && (
        <div className="-mx-5 md:-mx-8 -mt-2">
          <CrmContractsPage />
        </div>
      )}

      {tab === "expenses" && <FixedExpensesPanel />}

      {tab === "vendors" && <VendorsPanel />}

      {/* 센터 탈퇴 / 양도 는 위험 작업이라 UI 에서 숨김.
          수정이 필요하면 관리자에게 문의. WithdrawModal/TransferModal 컴포넌트 정의는 유지. */}
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

/* ─── 센터 정보 패널 ─────────── */
interface CenterProfile {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  naver_url: string | null;
  google_url: string | null;
  instagram_id: string | null;
  youtube_url: string | null;
}

function CenterProfilePanel({ role }: { role: "owner" | "admin" | "manager" | "trainer" }) {
  const { getIdToken } = useAuth();
  const [profile, setProfile] = useState<CenterProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const canEdit = role === "owner" || role === "admin";

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [naverUrl, setNaverUrl] = useState("");
  const [googleUrl, setGoogleUrl] = useState("");
  const [instagramId, setInstagramId] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없어요");
      const res = await fetch("/api/crm/centers/me", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      const c: CenterProfile = data.center;
      setProfile(c);
      setName(c.name ?? "");
      setPhone(formatPhone(c.phone ?? ""));
      setAddress(c.address ?? "");
      setNaverUrl(c.naver_url ?? "");
      setGoogleUrl(c.google_url ?? "");
      setInstagramId(c.instagram_id ?? "");
      setYoutubeUrl(c.youtube_url ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty =
    !!profile &&
    (name !== (profile.name ?? "") ||
      phone !== formatPhone(profile.phone ?? "") ||
      address !== (profile.address ?? "") ||
      naverUrl !== (profile.naver_url ?? "") ||
      googleUrl !== (profile.google_url ?? "") ||
      instagramId !== (profile.instagram_id ?? "") ||
      youtubeUrl !== (profile.youtube_url ?? ""));

  const save = async () => {
    if (!canEdit || !dirty || saving) return;
    setSaving(true);
    setError("");
    setMsg("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/centers/me", {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          naver_url: naverUrl.trim(),
          google_url: googleUrl.trim(),
          instagram_id: instagramId.trim().replace(/^@/, ""),
          youtube_url: youtubeUrl.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
      setMsg("저장했어요.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="px-4 py-6 text-[12.5px] text-[#8C8270]">불러오는 중…</div>;
  }
  if (!profile) {
    return <div className="px-4 py-6 text-[12.5px] text-red-600">{error || "센터 정보를 찾을 수 없어요"}</div>;
  }

  return (
    <div className="space-y-3">
      <Card title="센터 정보">
        <p className="text-[12px] text-[#8C8270] dark:text-zinc-500 leading-relaxed">
          센터 대표 정보 · 회원 앱과 계약서에 노출됩니다. 수정은 {canEdit ? "가능합니다" : "대표자/관리자만 가능해요"}.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ProfileField label="센터명" value={name} onChange={setName} disabled={!canEdit} placeholder="예: 모두짐 강남점" />
          <ProfileField
            label="센터 전화번호"
            value={phone}
            onChange={(v) => setPhone(formatPhone(v))}
            disabled={!canEdit}
            placeholder="02-1234-5678"
            inputMode="numeric"
          />
          <div className="md:col-span-2">
            <ProfileField label="센터 주소" value={address} onChange={setAddress} disabled={!canEdit} placeholder="서울시 강남구 테헤란로 1길 1, 3층" />
          </div>
          <ProfileField label="네이버 링크" value={naverUrl} onChange={setNaverUrl} disabled={!canEdit} placeholder="https://map.naver.com/..." type="url" />
          <ProfileField label="구글 링크" value={googleUrl} onChange={setGoogleUrl} disabled={!canEdit} placeholder="https://g.co/kgs/..." type="url" />
          <ProfileField label="인스타 아이디" value={instagramId} onChange={setInstagramId} disabled={!canEdit} placeholder="moducm_gangnam (@ 제외)" />
          <ProfileField label="유튜브 링크" value={youtubeUrl} onChange={setYoutubeUrl} disabled={!canEdit} placeholder="https://youtube.com/@..." type="url" />
        </div>

        {error && <div className="text-[12.5px] text-red-600">{error}</div>}
        {msg && !error && <div className="text-[12.5px] text-[#6B7B3A] dark:text-[#A8B87A]">{msg}</div>}

        {canEdit && (
          <div className="flex justify-end">
            <button
              onClick={save}
              disabled={!dirty || saving}
              className="px-4 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932] disabled:opacity-50"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}

function ProfileField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  type = "text",
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <div>
      <div className="text-[12.5px] text-[#A89B80] mb-1.5">{label}</div>
      <input
        type={type}
        inputMode={inputMode}
        className="w-full px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[14px] text-[#2A251D] dark:text-zinc-100 focus:outline-none focus:border-[#6B7B3A] disabled:opacity-60"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  );
}

function GradesPanel() {
  const { getIdToken } = useAuth();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 신규 등급 폼
  const [newLabel, setNewLabel] = useState("");
  const [newBase, setNewBase] = useState<GradeMeta["base_role"]>("trainer");
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
      <div className="-mt-1 mb-4 rounded-xl border border-[#E4D9C6] bg-[#FAF6EE] px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/45">
        <div className="text-[13px] font-semibold text-[#2A251D] dark:text-zinc-100">
          센터에서 사용하는 직원 등급을 관리합니다
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-[#6B5D47] dark:text-zinc-400">
          대표자 등급만 고정이고, 나머지 등급은 이름 변경·삭제가 가능해요. 추가한 등급은 직급 권한 탭에도 자동으로 나타나며, 권한 게이트는 기본 분류에 따라 동작합니다.
        </p>
      </div>

      {loading ? (
        <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : (
        <ul className="grid gap-2">
          {grades.map((g) => (
            <li
              key={g.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-[#E4D9C6] bg-white/80 px-3.5 py-3 shadow-sm transition-colors hover:bg-[#FFFCF6] dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/55"
            >
              <div className="flex flex-1 items-center gap-3 min-w-0">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold ${
                  g.base_role === "owner"
                    ? "bg-[#2F3A2B] text-white dark:bg-[#A8B87A] dark:text-zinc-950"
                    : g.base_role === "admin"
                    ? "bg-[#5A8BB0]/12 text-[#315F7D] dark:bg-sky-950/40 dark:text-sky-300"
                    : g.base_role === "manager"
                    ? "bg-[#B47B2A]/12 text-[#8A641D] dark:bg-amber-950/35 dark:text-amber-300"
                    : "bg-[#8B6BAA]/12 text-[#6E548B] dark:bg-purple-950/35 dark:text-purple-300"
                }`}>
                  {(g.label || "?").slice(0, 1)}
                </div>
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
                  <div className="min-w-0">
                    <div className="text-[14px] font-bold text-[#2A251D] dark:text-zinc-100 truncate">
                      {g.label}
                    </div>
                    <div className="mt-0.5 text-[11.5px] font-medium text-[#8C8270] dark:text-zinc-500">
                      {BASE_ROLE_LABEL[g.base_role] ?? g.base_role} 기반
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
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
                ) : g.base_role === "owner" ? (
                  <>
                    {g.is_system && (
                      <span className="px-2.5 py-1 rounded-md bg-[#6B7B3A]/10 text-[11.5px] font-semibold text-[#6B7B3A] dark:bg-[#A8B87A]/15 dark:text-[#A8B87A]">
                        기본
                      </span>
                    )}
                    <span className="px-2.5 py-1 text-[11.5px] font-semibold text-[#A89B80]">
                      대표자 등급(고정)
                    </span>
                  </>
                ) : (
                  <>
                    {g.is_system && (
                      <span className="px-2.5 py-1 rounded-md bg-[#6B7B3A]/10 text-[11.5px] font-semibold text-[#6B7B3A] dark:bg-[#A8B87A]/15 dark:text-[#A8B87A]">
                        기본
                      </span>
                    )}
                    <button
                      onClick={() => {
                        setEditingId(g.id);
                        setEditingLabel(g.label);
                      }}
                      className="px-2.5 py-1 rounded-md border border-[#D9CDB8] bg-[#FEFCF7] text-[12px] font-semibold text-[#3A342A] hover:bg-[#F5F0E5] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      이름 변경
                    </button>
                    <button
                      onClick={() => deleteGrade(g)}
                      className="px-2.5 py-1 rounded-md border border-red-200 bg-white text-[12px] font-semibold text-red-700 hover:bg-red-50 dark:border-red-900 dark:bg-zinc-950 dark:text-red-300 dark:hover:bg-red-950/35"
                    >
                      삭제
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 rounded-xl border border-[#E4D9C6] bg-[#FEFCF7] px-4 py-3.5 dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-[13px] font-bold text-[#2A251D] dark:text-zinc-100">
              새 등급 추가
            </div>
            <p className="mt-0.5 text-[11.5px] text-[#8C8270] dark:text-zinc-500">
              이름은 자유롭게 만들고, 권한 기준은 기반 등급으로 정합니다.
            </p>
          </div>
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
            <option value="fc">FC 기반</option>
            <option value="alba">아르바이트 기반</option>
          </select>
          <button
            onClick={addGrade}
            disabled={adding || !newLabel.trim()}
            className="px-4 rounded-lg bg-[#2F3A2B] disabled:opacity-60 text-white text-[13px] font-semibold hover:bg-[#263121] whitespace-nowrap dark:bg-[#A8B87A] dark:text-zinc-950"
          >
            {adding ? "추가 중…" : "추가"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
    </Card>
  );
}

function TransferModal({
  open,
  centerName,
  businessNo,
  onClose,
  onTransferred,
}: {
  open: boolean;
  centerName: string;
  businessNo?: string | null;
  onClose: () => void;
  onTransferred: (newOwnerName: string) => void;
}) {
  const { getIdToken } = useAuth();
  const [vals, setVals] = useState<CenterIdentity>({
    center_name: "",
    owner_name: "",
    owner_phone: "",
    business_no: "",
    resident_no: "",
  });
  const requireBiz = !!(businessNo && businessNo.replace(/[\s-]/g, "").length > 0);
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
      setVals({ center_name: "", owner_name: "", owner_phone: "", business_no: "", resident_no: "" });
    }
  }, [open]);

  const identityFilled =
    vals.center_name.trim() &&
    vals.owner_name.trim() &&
    vals.owner_phone.replace(/[^0-9]/g, "").length >= 10 &&
    (!requireBiz || vals.business_no.replace(/[^0-9]/g, "").length >= 8) &&
    vals.resident_no.replace(/[^0-9]/g, "").length === 13;

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
        body: JSON.stringify({ firebase_uid: picked.firebase_uid, ...vals }),
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

        {picked && (
          <div className="pt-1 border-t border-[#E8E0D0]/70 dark:border-zinc-800">
            <p className="text-[12.5px] text-[#3A342A] dark:text-zinc-300 mt-3 mb-2">
              본인 확인을 위해 아래 정보를 모두 정확히 입력해 주세요.
            </p>
            <IdentityVerifyFields vals={vals} set={(p) => setVals((v) => ({ ...v, ...p }))} requireBiz={requireBiz} />
          </div>
        )}

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={confirm}
            disabled={!picked || !identityFilled || submitting}
            className="flex-1 px-4 py-2.5 rounded-lg bg-[#6B7B3A] disabled:bg-[#A8B87A]/40 text-white text-[13.5px] font-semibold hover:bg-[#5a6932]"
          >
            {submitting ? "양도 중…" : "센터 양도"}
          </button>
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13.5px] font-semibold text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            취소
          </button>
        </div>
      </div>
    </CrmModal>
  );
}

export interface CenterIdentity {
  center_name: string;
  owner_name: string;
  owner_phone: string;
  business_no: string;
  resident_no: string;
}
const emptyIdentity: CenterIdentity = {
  center_name: "",
  owner_name: "",
  owner_phone: "",
  business_no: "",
  resident_no: "",
};

/** 탈퇴/양도 본인 확인 5개 입력 (센터명·대표자명·대표자 휴대폰·사업자번호·대표자 주민번호) */
function IdentityVerifyFields({
  vals,
  set,
  requireBiz,
}: {
  vals: CenterIdentity;
  set: (patch: Partial<CenterIdentity>) => void;
  requireBiz: boolean;
}) {
  return (
    <div className="space-y-2.5">
      <div>
        <label className="block text-[12px] text-[#3A342A] dark:text-zinc-300 mb-1">센터 이름</label>
        <input className={crmInputClass} value={vals.center_name} onChange={(e) => set({ center_name: e.target.value })} placeholder="센터 이름" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <label className="block text-[12px] text-[#3A342A] dark:text-zinc-300 mb-1">대표자 이름</label>
          <input className={crmInputClass} value={vals.owner_name} onChange={(e) => set({ owner_name: e.target.value })} placeholder="실명" />
        </div>
        <div>
          <label className="block text-[12px] text-[#3A342A] dark:text-zinc-300 mb-1">대표자 휴대폰번호</label>
          <input className={crmInputClass} inputMode="numeric" value={vals.owner_phone} onChange={(e) => set({ owner_phone: formatPhone(e.target.value) })} placeholder="010-0000-0000" />
        </div>
      </div>
      {requireBiz && (
        <div>
          <label className="block text-[12px] text-[#3A342A] dark:text-zinc-300 mb-1">사업자 등록번호</label>
          <input className={crmInputClass} inputMode="numeric" value={vals.business_no} onChange={(e) => set({ business_no: e.target.value })} placeholder="000-00-00000" />
        </div>
      )}
      <div>
        <label className="block text-[12px] text-[#3A342A] dark:text-zinc-300 mb-1">대표자 주민등록번호</label>
        <input
          className={`${crmInputClass} tracking-wider`}
          type="password"
          inputMode="numeric"
          maxLength={13}
          value={vals.resident_no}
          onChange={(e) => set({ resident_no: e.target.value.replace(/[^0-9]/g, "").slice(0, 13) })}
          placeholder="숫자 13자리"
        />
        <p className="mt-1 text-[11px] text-[#A89B80]">
          직원 관리 &gt; 대표자 상세에 등록한 주민번호와 일치해야 진행됩니다.
        </p>
      </div>
    </div>
  );
}

function WithdrawModal({
  open,
  businessNo,
  onClose,
  onConfirm,
}: {
  open: boolean;
  centerName: string;
  businessNo: string | null;
  onClose: () => void;
  onConfirm: (identity: CenterIdentity) => Promise<void>;
}) {
  const [vals, setVals] = useState<CenterIdentity>(emptyIdentity);
  const [submitting, setSubmitting] = useState(false);
  const requireBiz = !!(businessNo && businessNo.replace(/[\s-]/g, "").length > 0);

  useEffect(() => {
    if (!open) {
      setVals(emptyIdentity);
      setSubmitting(false);
    }
  }, [open]);

  const filled =
    vals.center_name.trim() &&
    vals.owner_name.trim() &&
    vals.owner_phone.replace(/[^0-9]/g, "").length >= 10 &&
    (!requireBiz || vals.business_no.replace(/[^0-9]/g, "").length >= 8) &&
    vals.resident_no.replace(/[^0-9]/g, "").length === 13;

  const handleConfirm = async () => {
    if (!filled || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(vals);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CrmModal open={open} onClose={submitting ? () => {} : onClose} title="정말 센터를 탈퇴하시겠어요?">
      <div className="space-y-3.5">
        <div className="px-3.5 py-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200/60 dark:border-red-900/40">
          <p className="text-[13px] font-semibold text-red-700 dark:text-red-300">
            탈퇴하면 회원·수강권·예약·직원·설정 등 모든 정보가 영구 삭제됩니다. 되돌릴 수 없어요.
          </p>
        </div>
        <p className="text-[12.5px] text-[#3A342A] dark:text-zinc-300">
          본인 확인을 위해 아래 정보를 모두 정확히 입력해 주세요.
        </p>
        <IdentityVerifyFields vals={vals} set={(p) => setVals((v) => ({ ...v, ...p }))} requireBiz={requireBiz} />

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleConfirm}
            disabled={!filled || submitting}
            className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 disabled:bg-red-300 dark:disabled:bg-red-900/40 text-white text-[13.5px] font-semibold hover:bg-red-700"
          >
            {submitting ? "탈퇴 중…" : "센터 탈퇴"}
          </button>
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13.5px] font-semibold text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            취소
          </button>
        </div>
      </div>
    </CrmModal>
  );
}

/* ─── 직급 권한 매트릭스 패널 ──────────────────────── */

function RolePermissionsPanel() {
  const { getIdToken } = useAuth();
  const [grades, setGrades] = useState<GradeMeta[]>([]);
  const [items, setItems] = useState<
    { grade_id: number; permission_key: string; enabled: boolean }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const [gRes, pRes] = await Promise.all([
        fetch("/api/crm/grades", {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        fetch("/api/crm/grade-permissions", {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
      ]);
      const gData = await gRes.json();
      const pData = await pRes.json();
      if (!gRes.ok) throw new Error(gData?.error || "등급 조회 실패");
      if (!pRes.ok) throw new Error(pData?.error || "권한 조회 실패");
      setGrades(
        (gData.grades ?? []).map((g: { id: number; base_role: string; label: string }) => ({
          id: g.id,
          base_role: g.base_role as GradeMeta["base_role"],
          label: g.label,
        }))
      );
      setItems(pData.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  const matrix = buildGradePermissionMatrix(grades, items);

  const toggle = async (grade: GradeMeta, permKey: string, next: boolean) => {
    if (grade.base_role === "owner") return; // 대표자 등급은 항상 활성
    const cellId = `${grade.id}:${permKey}`;
    setSaving(cellId);
    // 낙관적 업데이트
    const filtered = items.filter(
      (i) => !(i.grade_id === grade.id && i.permission_key === permKey)
    );
    setItems([...filtered, { grade_id: grade.id, permission_key: permKey, enabled: next }]);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/grade-permissions", {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ grade_id: grade.id, permission_key: permKey, enabled: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
      load();
    } finally {
      setSaving(null);
    }
  };

  const colWidth = grades.length > 5 ? "w-[58px]" : "w-[70px]";
  const minW = 200 + grades.length * 64;

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-[#6B5D47] dark:text-zinc-400">
        각 직급이 CRM 에서 사용할 수 있는 기능을 On/Off 로 설정해요. 직급별로 개별 설정되며, 대표자는 항상 모든 권한이 활성 상태예요.
      </p>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : grades.length === 0 ? (
        <div className="text-[13px] text-[#8C8270]">등급이 없습니다. 등급 관리에서 먼저 추가해주세요.</div>
      ) : (
        <div className="space-y-5">
          {PERMISSION_GROUPS.map((group) => (
            <section
              key={group.key}
              className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 overflow-hidden"
            >
              <div className="px-4 py-2.5 bg-[#FBF7EB] dark:bg-zinc-900/80 border-b border-[#E8E0D0] dark:border-zinc-800">
                <h3 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">
                  {group.label}
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]" style={{ minWidth: minW }}>
                  <thead>
                    <tr className="text-[12px] text-[#A89B80] dark:text-zinc-500 bg-[#FBF7EB]/50 dark:bg-zinc-900/40">
                      <th className="text-left px-4 py-2 font-medium">권한</th>
                      {grades.map((g) => (
                        <th
                          key={g.id}
                          className={`px-2 py-2 font-medium text-center ${colWidth}`}
                        >
                          {g.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((it) => (
                      <tr
                        key={it.key}
                        className="border-t border-[#E8E0D0]/60 dark:border-zinc-800/60"
                      >
                        <td className="px-4 py-2 text-[13px] text-[#3A342A] dark:text-zinc-300">
                          {it.label}
                        </td>
                        {grades.map((g) => {
                          const on = matrix[g.id]?.[it.key] ?? false;
                          const cellId = `${g.id}:${it.key}`;
                          const isSaving = saving === cellId;
                          const locked = g.base_role === "owner";
                          return (
                            <td key={g.id} className="px-2 py-1.5 text-center">
                              <button
                                type="button"
                                onClick={() => toggle(g, it.key, !on)}
                                disabled={locked || isSaving}
                                className={`relative inline-flex w-9 h-5 rounded-full transition-colors disabled:opacity-70
                                  ${on
                                    ? "bg-[#6B7B3A]"
                                    : "bg-[#E8E0D0] dark:bg-zinc-700"
                                  }
                                  ${locked ? "cursor-not-allowed" : ""}`}
                                title={locked ? "대표자는 항상 활성" : undefined}
                              >
                                <span
                                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform
                                    ${on ? "translate-x-[18px]" : "translate-x-0.5"}`}
                                />
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="text-[11.5px] text-[#A89B80] leading-relaxed">
        기본값은 최소 권한 원칙에 따라 설정되어 있어요. 등급을 추가·수정하려면 등급 관리 탭을 이용하세요.
      </p>
    </div>
  );
}

/* ─── 고정 지출 패널 ──────────────────────── */

interface FixedExpense {
  id: number;
  label: string;
  amount_won: number;
  billing_day: number | null;
  memo: string | null;
  sort_order: number;
}

function FixedExpensesPanel() {
  const { getIdToken } = useAuth();
  const [list, setList] = useState<FixedExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  // 신규 입력
  const [nLabel, setNLabel] = useState("");
  const [nAmount, setNAmount] = useState("");
  const [nDay, setNDay] = useState("");
  const [nMemo, setNMemo] = useState("");

  // 편집 상태
  const [editingId, setEditingId] = useState<number | null>(null);
  const [eLabel, setELabel] = useState("");
  const [eAmount, setEAmount] = useState("");
  const [eDay, setEDay] = useState("");
  const [eMemo, setEMemo] = useState("");

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch("/api/crm/fixed-expenses", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setList(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  const total = list.reduce((s, x) => s + (x.amount_won ?? 0), 0);

  const add = async () => {
    setError("");
    const label = nLabel.trim();
    if (!label) return setError("항목명을 입력해 주세요");
    setAdding(true);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/fixed-expenses", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          label,
          amount_won: parseWon(nAmount),
          billing_day: nDay ? Number(nDay) : null,
          memo: nMemo.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "추가 실패");
      setNLabel("");
      setNAmount("");
      setNDay("");
      setNMemo("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (x: FixedExpense) => {
    setEditingId(x.id);
    setELabel(x.label);
    setEAmount(String(x.amount_won ?? 0));
    setEDay(x.billing_day ? String(x.billing_day) : "");
    setEMemo(x.memo ?? "");
  };
  const cancelEdit = () => {
    setEditingId(null);
  };
  const saveEdit = async () => {
    if (!editingId) return;
    const label = eLabel.trim();
    if (!label) return setError("항목명을 입력해 주세요");
    const token = await getIdToken();
    const res = await fetch(`/api/crm/fixed-expenses/${editingId}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        label,
        amount_won: parseWon(eAmount),
        billing_day: eDay ? Number(eDay) : null,
        memo: eMemo.trim() || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error || "수정 실패");
      return;
    }
    cancelEdit();
    load();
  };

  const remove = async (id: number) => {
    if (!window.confirm("이 고정 지출 항목을 삭제할까요?")) return;
    const token = await getIdToken();
    const res = await fetch(`/api/crm/fixed-expenses/${id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.ok) load();
  };

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-[#6B5D47] dark:text-zinc-400">
        가게 월세, 관리비, 기타 정기 결제 등 매월 고정으로 나가는 지출을 등록해요. 결제일은 선택 사항이에요.
      </p>

      {/* 신규 입력 */}
      <div className="p-3.5 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FBF7EB]/40 dark:bg-zinc-900/40 space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_110px] gap-2">
          <input
            className={crmInputClass}
            value={nLabel}
            onChange={(e) => setNLabel(e.target.value.slice(0, 40))}
            placeholder="항목명 (예: 가게 월세)"
            maxLength={40}
          />
          <input
            className={`${crmInputClass} text-right`}
            value={nAmount ? formatWon(parseWon(nAmount)) : ""}
            onChange={(e) => setNAmount(e.target.value)}
            inputMode="numeric"
            placeholder="금액(원)"
          />
          <input
            className={crmInputClass}
            value={nDay}
            onChange={(e) => setNDay(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
            inputMode="numeric"
            placeholder="결제일"
          />
        </div>
        <div className="flex gap-2">
          <input
            className={`${crmInputClass} flex-1`}
            value={nMemo}
            onChange={(e) => setNMemo(e.target.value.slice(0, 100))}
            placeholder="메모 (선택)"
            maxLength={100}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <button
            onClick={add}
            disabled={adding || !nLabel.trim()}
            className="px-4 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932] disabled:opacity-60 whitespace-nowrap"
          >
            {adding ? "…" : "+ 추가"}
          </button>
        </div>
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
          등록된 고정 지출이 없어요. 위 입력창에서 추가해 주세요.
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {list.map((x) => (
              <li
                key={x.id}
                className="px-4 py-3 rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900"
              >
                {editingId === x.id ? (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_110px] gap-2">
                      <input
                        className={crmInputClass}
                        value={eLabel}
                        onChange={(e) => setELabel(e.target.value.slice(0, 40))}
                        placeholder="항목명"
                        maxLength={40}
                        autoFocus
                      />
                      <input
                        className={`${crmInputClass} text-right`}
                        value={eAmount ? formatWon(parseWon(eAmount)) : ""}
                        onChange={(e) => setEAmount(e.target.value)}
                        inputMode="numeric"
                        placeholder="금액(원)"
                      />
                      <input
                        className={crmInputClass}
                        value={eDay}
                        onChange={(e) => setEDay(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
                        inputMode="numeric"
                        placeholder="결제일"
                      />
                    </div>
                    <div className="flex gap-2">
                      <input
                        className={`${crmInputClass} flex-1`}
                        value={eMemo}
                        onChange={(e) => setEMemo(e.target.value.slice(0, 100))}
                        placeholder="메모 (선택)"
                        maxLength={100}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            saveEdit();
                          }
                          if (e.key === "Escape") cancelEdit();
                        }}
                      />
                      <button
                        onClick={saveEdit}
                        className="px-3 py-1.5 rounded-lg bg-[#6B7B3A] text-white text-[12px] font-semibold whitespace-nowrap"
                      >
                        저장
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="px-2 py-1.5 text-[12px] text-[#6B5D47]"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-[13.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
                          {x.label}
                        </span>
                        {x.billing_day != null && (
                          <span className="text-[11.5px] text-[#A89B80]">매월 {x.billing_day}일</span>
                        )}
                      </div>
                      {x.memo && (
                        <div className="mt-0.5 text-[11.5px] text-[#8C8270] truncate">{x.memo}</div>
                      )}
                    </div>
                    <span className="text-[14px] font-bold text-[#3A342A] dark:text-zinc-100 tabular-nums whitespace-nowrap">
                      {formatWon(x.amount_won)}원
                    </span>
                    <button
                      onClick={() => startEdit(x)}
                      className="px-2.5 py-1 rounded-md border border-[#E8E0D0] dark:border-zinc-700 text-[12px] text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5]"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => remove(x.id)}
                      className="px-2.5 py-1 rounded-md border border-red-200 dark:border-red-900/60 text-[12px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      삭제
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#6B7B3A]/8 dark:bg-[#6B7B3A]/15 border border-[#6B7B3A]/25">
            <span className="text-[13px] font-semibold text-[#3A342A] dark:text-zinc-200">
              월 고정 지출 합계
            </span>
            <span className="text-[16px] font-bold text-[#6B7B3A] dark:text-[#A8B87A] tabular-nums">
              {formatWon(total)}원
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── 공지 설정 패널 ──────────────────────── */

interface Notice {
  id: number;
  title: string;
  body: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

/* ─── 거래처 패널 ──────────────────────── */
interface Vendor {
  id: number;
  name: string;
  phone: string | null;
  category: string | null;
  memo: string | null;
}

function VendorsPanel() {
  const { getIdToken } = useAuth();
  const [list, setList] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  const [nName, setNName] = useState("");
  const [nPhone, setNPhone] = useState("");
  const [nCategory, setNCategory] = useState("");
  const [nMemo, setNMemo] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [eName, setEName] = useState("");
  const [ePhone, setEPhone] = useState("");
  const [eCategory, setECategory] = useState("");
  const [eMemo, setEMemo] = useState("");

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch("/api/crm/vendors", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setList(data.items ?? []);
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
    setError("");
    if (!nName.trim()) return setError("상호를 입력해 주세요");
    setAdding(true);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/vendors", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          name: nName.trim(),
          phone: nPhone.trim() || null,
          category: nCategory.trim() || null,
          memo: nMemo.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "추가 실패");
      setNName("");
      setNPhone("");
      setNCategory("");
      setNMemo("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (v: Vendor) => {
    setEditingId(v.id);
    setEName(v.name);
    setEPhone(v.phone ?? "");
    setECategory(v.category ?? "");
    setEMemo(v.memo ?? "");
  };
  const saveEdit = async () => {
    if (!editingId) return;
    if (!eName.trim()) return setError("상호를 입력해 주세요");
    const token = await getIdToken();
    const res = await fetch(`/api/crm/vendors/${editingId}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        name: eName.trim(),
        phone: ePhone.trim() || null,
        category: eCategory.trim() || null,
        memo: eMemo.trim() || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error || "수정 실패");
      return;
    }
    setEditingId(null);
    load();
  };

  const remove = async (id: number) => {
    if (!window.confirm("이 거래처를 삭제할까요?")) return;
    const token = await getIdToken();
    const res = await fetch(`/api/crm/vendors/${id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.ok) load();
  };

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-[#6B5D47] dark:text-zinc-400">
        거래하는 업체(납품·수리·용품·세탁 등)를 등록해요. 상호·전화번호와 무슨 가게인지(거래 내용)를 적어두면 필요할 때 바로 연락할 수 있어요.
      </p>

      {/* 신규 입력 */}
      <div className="p-3.5 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FBF7EB]/40 dark:bg-zinc-900/40 space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            className={crmInputClass}
            value={nName}
            onChange={(e) => setNName(e.target.value.slice(0, 60))}
            placeholder="상호 (예: OO스포츠용품)"
            maxLength={60}
          />
          <input
            className={crmInputClass}
            value={nPhone}
            onChange={(e) => setNPhone(formatPhone(e.target.value))}
            inputMode="numeric"
            placeholder="전화번호"
          />
        </div>
        <input
          className={crmInputClass}
          value={nCategory}
          onChange={(e) => setNCategory(e.target.value.slice(0, 80))}
          placeholder="무슨 가게 / 어떤 거래인지 (예: 운동복 납품, 락커 수리)"
          maxLength={80}
        />
        <input
          className={crmInputClass}
          value={nMemo}
          onChange={(e) => setNMemo(e.target.value.slice(0, 200))}
          placeholder="메모 (선택)"
          maxLength={200}
        />
        <button
          onClick={add}
          disabled={adding}
          className="w-full sm:w-auto px-4 py-2 rounded-lg bg-[#6B7B3A] disabled:opacity-60 text-white text-[13px] font-semibold hover:bg-[#5a6932]"
        >
          {adding ? "추가 중…" : "+ 거래처 추가"}
        </button>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* 목록 */}
      {loading ? (
        <div className="py-6 text-center text-[12.5px] text-[#8C8270]">불러오는 중…</div>
      ) : list.length === 0 ? (
        <div className="px-4 py-8 text-center text-[12.5px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
          등록된 거래처가 없습니다.
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((v) => (
            <li
              key={v.id}
              className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 px-3.5 py-3"
            >
              {editingId === v.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input className={crmInputClass} value={eName} onChange={(e) => setEName(e.target.value.slice(0, 60))} placeholder="상호" />
                    <input className={crmInputClass} value={ePhone} onChange={(e) => setEPhone(formatPhone(e.target.value))} placeholder="전화번호" inputMode="numeric" />
                  </div>
                  <input className={crmInputClass} value={eCategory} onChange={(e) => setECategory(e.target.value.slice(0, 80))} placeholder="무슨 가게 / 어떤 거래" />
                  <input className={crmInputClass} value={eMemo} onChange={(e) => setEMemo(e.target.value.slice(0, 200))} placeholder="메모" />
                  <div className="flex gap-2">
                    <button onClick={saveEdit} className="px-3.5 py-1.5 rounded-lg bg-[#6B7B3A] text-white text-[12.5px] font-semibold hover:bg-[#5a6932]">저장</button>
                    <button onClick={() => setEditingId(null)} className="px-3.5 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12.5px] text-[#6B5D47] dark:text-zinc-300">취소</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">{v.name}</span>
                      {v.phone && (
                        <a href={`tel:${v.phone.replace(/[^0-9]/g, "")}`} className="text-[12.5px] text-[#6B7B3A] dark:text-[#A8B87A] hover:underline">
                          {formatPhone(v.phone)}
                        </a>
                      )}
                    </div>
                    {v.category && <div className="mt-0.5 text-[12.5px] text-[#3A342A] dark:text-zinc-300">{v.category}</div>}
                    {v.memo && <div className="mt-0.5 text-[11.5px] text-[#A89B80]">{v.memo}</div>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => startEdit(v)} className="px-2.5 py-1 rounded-md border border-[#E8E0D0] dark:border-zinc-700 text-[12px] text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800">수정</button>
                    <button onClick={() => remove(v.id)} className="px-2.5 py-1 rounded-md border border-red-200 dark:border-red-900/60 text-[12px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30">삭제</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NoticesPanel() {
  const { getIdToken } = useAuth();
  const [list, setList] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  // 신규 입력
  const [nTitle, setNTitle] = useState("");
  const [nBody, setNBody] = useState("");
  const [nPublished, setNPublished] = useState(true);

  // 편집 상태
  const [editingId, setEditingId] = useState<number | null>(null);
  const [eTitle, setETitle] = useState("");
  const [eBody, setEBody] = useState("");
  const [ePublished, setEPublished] = useState(true);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch("/api/crm/notices", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setList(data.notices ?? []);
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
    setError("");
    const title = nTitle.trim();
    if (!title) return setError("제목을 입력해 주세요");
    setAdding(true);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/notices", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ title, body: nBody.trim(), is_published: nPublished }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "추가 실패");
      setNTitle("");
      setNBody("");
      setNPublished(true);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (x: Notice) => {
    setEditingId(x.id);
    setETitle(x.title);
    setEBody(x.body ?? "");
    setEPublished(x.is_published);
  };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = async () => {
    if (!editingId) return;
    const title = eTitle.trim();
    if (!title) return setError("제목을 입력해 주세요");
    const token = await getIdToken();
    const res = await fetch(`/api/crm/notices/${editingId}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ title, body: eBody.trim(), is_published: ePublished }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error || "수정 실패");
      return;
    }
    cancelEdit();
    load();
  };

  const togglePublish = async (x: Notice) => {
    const token = await getIdToken();
    const res = await fetch(`/api/crm/notices/${x.id}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ is_published: !x.is_published }),
    });
    if (res.ok) load();
  };

  const remove = async (id: number) => {
    if (!window.confirm("이 공지를 삭제할까요?")) return;
    const token = await getIdToken();
    const res = await fetch(`/api/crm/notices/${id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.ok) load();
  };

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-[#6B5D47] dark:text-zinc-400">
        센터 공지사항을 등록해요. 게시 상태인 공지는 추후 회원 전용 앱 메인 화면에 표시될 예정이에요.
      </p>

      {/* 신규 입력 */}
      <div className="p-3.5 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FBF7EB]/40 dark:bg-zinc-900/40 space-y-2.5">
        <input
          className={crmInputClass}
          value={nTitle}
          onChange={(e) => setNTitle(e.target.value.slice(0, 100))}
          placeholder="공지 제목"
          maxLength={100}
        />
        <textarea
          className={`${crmInputClass} resize-none`}
          value={nBody}
          onChange={(e) => setNBody(e.target.value.slice(0, 2000))}
          placeholder="공지 내용을 입력해 주세요."
          rows={4}
        />
        <div className="flex items-center justify-between gap-2">
          <div className="w-44">
            <Toggle label="게시 (앱 노출)" on={nPublished} onChange={setNPublished} />
          </div>
          <button
            onClick={add}
            disabled={adding || !nTitle.trim()}
            className="px-4 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932] disabled:opacity-60 whitespace-nowrap"
          >
            {adding ? "…" : "+ 공지 등록"}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* 목록 */}
      {loading ? (
        <div className="px-4 py-8 text-center text-[12.5px] text-[#8C8270]">불러오는 중…</div>
      ) : list.length === 0 ? (
        <div className="px-4 py-8 text-center text-[12.5px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
          등록된 공지가 없어요.
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((x) => (
            <li
              key={x.id}
              className="p-3.5 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900"
            >
              {editingId === x.id ? (
                <div className="space-y-2.5">
                  <input
                    className={crmInputClass}
                    value={eTitle}
                    onChange={(e) => setETitle(e.target.value.slice(0, 100))}
                    maxLength={100}
                  />
                  <textarea
                    className={`${crmInputClass} resize-none`}
                    value={eBody}
                    onChange={(e) => setEBody(e.target.value.slice(0, 2000))}
                    rows={4}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <div className="w-44">
                      <Toggle label="게시 (앱 노출)" on={ePublished} onChange={setEPublished} />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={cancelEdit}
                        className="px-3 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12.5px] font-medium text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
                      >
                        취소
                      </button>
                      <button
                        onClick={saveEdit}
                        className="px-4 py-1.5 rounded-lg bg-[#6B7B3A] text-white text-[12.5px] font-semibold hover:bg-[#5a6932]"
                      >
                        저장
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 truncate">
                          {x.title}
                        </span>
                        <span
                          className={`shrink-0 px-1.5 py-0.5 rounded text-[10.5px] font-semibold ${
                            x.is_published
                              ? "bg-[#6B7B3A]/10 text-[#6B7B3A] dark:bg-[#6B7B3A]/30 dark:text-[#A8B87A]"
                              : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                          }`}
                        >
                          {x.is_published ? "게시중" : "숨김"}
                        </span>
                      </div>
                      {x.body && (
                        <p className="mt-1 text-[12.5px] text-[#6B5D47] dark:text-zinc-400 whitespace-pre-wrap line-clamp-3">
                          {x.body}
                        </p>
                      )}
                      <div className="mt-1.5 text-[11px] text-[#A89B80] dark:text-zinc-500">
                        {formatDateTime(x.updated_at)}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        onClick={() => togglePublish(x)}
                        className="px-2.5 py-1 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12px] font-medium text-[#6B5D47] dark:text-zinc-400 hover:border-[#6B7B3A]/40"
                      >
                        {x.is_published ? "숨기기" : "게시"}
                      </button>
                      <button
                        onClick={() => startEdit(x)}
                        className="px-2.5 py-1 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12px] font-medium text-[#3A342A] dark:text-zinc-300 hover:border-[#6B7B3A]/40"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => remove(x.id)}
                        className="px-2.5 py-1 rounded-lg border border-red-200 text-[12px] font-medium text-red-600 hover:bg-red-50"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  label,
  desc,
  icon,
  danger,
  badge = 0,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  desc: string;
  icon: (typeof SETTINGS_TABS)[number]["icon"];
  danger?: boolean;
  badge?: number;
}) {
  const activeCls = danger
    ? "border-red-300 bg-red-50 text-red-700 shadow-sm dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300"
    : "border-[#6B7B3A]/45 bg-[#F6F1E7] text-[#2F3A2B] shadow-sm dark:border-[#A8B87A]/40 dark:bg-[#A8B87A]/10 dark:text-[#DCE7B9]";
  const inactiveCls = danger
    ? "border-transparent text-red-500/80 hover:border-red-200 hover:bg-red-50/60 dark:text-red-400/80 dark:hover:border-red-900/70 dark:hover:bg-red-950/20"
    : "border-transparent text-[#6B5D47] hover:border-[#E4D9C6] hover:bg-[#FAF6EE] dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/70";
  const iconCls = active
    ? danger
      ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300"
      : "bg-[#2F3A2B] text-white dark:bg-[#A8B87A] dark:text-zinc-950"
    : danger
    ? "bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-400"
    : "bg-[#EFE7D5] text-[#8C8270] dark:bg-zinc-800 dark:text-zinc-500";
  return (
    <button
      onClick={onClick}
      className={`group flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all ${active ? activeCls : inactiveCls}`}
    >
      <span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors ${iconCls}`}>
        <SettingsTabIcon kind={icon} className="h-4 w-4" />
        {badge > 0 && (
          <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[16px] h-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {badge}
          </span>
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-bold">{label}</span>
        <span className={`mt-0.5 block truncate text-[11px] ${active ? "opacity-70" : "text-[#A89B80] dark:text-zinc-600"}`}>
          {desc}
        </span>
      </span>
    </button>
  );
}

function SettingsTabIcon({
  kind,
  className,
}: {
  kind: (typeof SETTINGS_TABS)[number]["icon"];
  className?: string;
}) {
  const common = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    viewBox: "0 0 24 24",
  };
  if (kind === "calendar") {
    return (
      <svg {...common}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3M5 11h14M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" />
      </svg>
    );
  }
  if (kind === "bell") {
    return (
      <svg {...common}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 01-6 0" />
      </svg>
    );
  }
  if (kind === "notice") {
    return (
      <svg {...common}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h16" />
      </svg>
    );
  }
  if (kind === "point") {
    return (
      <svg {...common}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-2.2 0-4 1.3-4 3s1.8 3 4 3 4 1.3 4 3-1.8 3-4 3m0-12V5m0 15v-3" />
      </svg>
    );
  }
  if (kind === "badge") {
    return (
      <svg {...common}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l3 5 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1 3-5z" />
      </svg>
    );
  }
  if (kind === "shield") {
    return (
      <svg {...common}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3z" />
      </svg>
    );
  }
  if (kind === "card") {
    return (
      <svg {...common}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18v10H3V7zm0 3h18M7 15h4" />
      </svg>
    );
  }
  if (kind === "vendor") {
    return (
      <svg {...common}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 10h16l-2-5H6l-2 5zm1 0v9h14v-9M9 19v-5h6v5" />
      </svg>
    );
  }
  if (kind === "danger") {
    return (
      <svg {...common}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 4.3L2.8 18a2 2 0 001.7 3h15a2 2 0 001.7-3L13.7 4.3a2 2 0 00-3.4 0z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 5h12M6 12h12M6 19h12" />
    </svg>
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

/** 구버전 단일 body 안의 "[제목]" 헤더를 기준으로 섹션 배열로 분리 */
