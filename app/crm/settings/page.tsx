"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { crmInputClass } from "../_components/crm-modal";

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
  "staff.update": "직원 정보 수정",
  "staff.permissions.update": "직원 권한 수정",
  "member.create": "회원 등록",
  "member.delete": "회원 삭제",
  "pass.issue": "수강권 발급",
  "pass.refund": "수강권 환불",
  "reservation.cancelled": "예약 취소",
  "reservation.noshow": "노쇼 처리",
  "settings.update": "설정 변경",
};

export default function CrmSettingsPage() {
  const { getIdToken } = useAuth();
  const [tab, setTab] = useState<"reservation" | "alerts" | "logs">("reservation");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch("/api/crm/settings", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setSettings(data.settings);
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
    <div className="px-5 md:px-8 py-6 md:py-8 max-w-3xl mx-auto">
      <header className="mb-5">
        <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
          설정
        </h1>
        <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
          예약·취소 정책, 알림, 활동 로그를 관리해요.
        </p>
      </header>

      <div className="mb-5 flex gap-1.5 border-b border-[#E8E0D0] dark:border-zinc-800">
        <TabBtn active={tab === "reservation"} onClick={() => setTab("reservation")}>
          예약 정책
        </TabBtn>
        <TabBtn active={tab === "alerts"} onClick={() => setTab("alerts")}>
          알림
        </TabBtn>
        <TabBtn active={tab === "logs"} onClick={() => setTab("logs")}>
          활동 로그
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
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 -mb-px text-[13px] font-medium border-b-2 transition-colors
        ${active
          ? "border-[#6B7B3A] text-[#6B7B3A] dark:text-[#A8B87A]"
          : "border-transparent text-[#8C8270] dark:text-zinc-500 hover:text-[#3A342A] dark:hover:text-zinc-300"
        }`}
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
