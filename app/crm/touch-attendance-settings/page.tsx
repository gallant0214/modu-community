"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { crmInputClass } from "../_components/crm-modal";

interface Settings {
  center_id: number;
  msg_active_entry: string;
  msg_birthday_entry: string;
  msg_expiring_membership: string;
  msg_exit: string;
  msg_outstanding: string;
  msg_expired_membership: string;
  msg_expired_rental: string;
  msg_expired_locker: string;
  msg_holding: string;
  msg_scheduled_membership: string;
  photo_suggest_enabled: boolean;
  identifier_use_number: boolean;
  identifier_use_phone: boolean;
  identifier_use_unified: boolean;
  attendance_mode_enabled: boolean;
  staff_call_enabled: boolean;
  exit_enabled: boolean;
  entry_reentry_minutes: number;
  lesson_reentry_until_end: boolean;
  attendance_mileage_earn: number;
  expiring_threshold_days: number;
}

const MSG_FIELDS: {
  key: keyof Settings;
  label: string;
  placeholder: string;
}[] = [
  { key: "msg_active_entry", label: "활성 회원 입장 시 안내 멘트", placeholder: "예: 출석 포인트가 적립되었습니다" },
  { key: "msg_birthday_entry", label: "생일자 회원 입장 시 안내 멘트", placeholder: "예: 생일 축하드립니다" },
  { key: "msg_expiring_membership", label: "만료 임박 [멤버십] 회원 입장 시 안내 멘트", placeholder: "예: 회원권이 곧 만료 예정입니다" },
  { key: "msg_exit", label: "퇴장 멘트", placeholder: "예: 퇴실 포인트가 적립되었습니다" },
  { key: "msg_outstanding", label: "미수금 멘트", placeholder: "멘트를 입력해주세요." },
  { key: "msg_expired_membership", label: "만료 회원 입장 시 안내 멘트", placeholder: "예: 회원권이 만료되었습니다. 카운터에 문의주세요!" },
  { key: "msg_expired_rental", label: "대여권 만료 멘트", placeholder: "예: 운동복이 만료되었습니다. 카운터에 문의주세요!" },
  { key: "msg_expired_locker", label: "락커 만료 멘트", placeholder: "예: 락커가 만료되었습니다. 카운터에 문의주세요!" },
  { key: "msg_holding", label: "홀딩 회원 입장 시 안내 멘트", placeholder: "멘트를 입력해주세요." },
  { key: "msg_scheduled_membership", label: "예정 [멤버십] 회원 입장 시 안내 멘트", placeholder: "멘트를 입력해주세요." },
];

export default function TouchAttendanceSettingsPage() {
  const { getIdToken } = useAuth();
  const [s, setS] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/touch-attendance-settings", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setS(data.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    setS((cur) => (cur ? { ...cur, [k]: v } : cur));
  };

  const save = async () => {
    if (!s || saving) return;
    setSaving(true);
    setError("");
    setSavedMsg("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/touch-attendance-settings", {
        method: "PUT",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(s),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
      setSavedMsg("저장 완료");
      setTimeout(() => setSavedMsg(""), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !s) {
    return (
      <div className="px-5 md:px-8 pt-3 pb-8 max-w-4xl mx-auto text-[13px] text-[#8C8270]">
        불러오는 중…
      </div>
    );
  }

  return (
    <div className="px-5 md:px-8 pt-3 pb-8 max-w-4xl mx-auto space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
            터치출석 설정
          </h1>
          <p className="mt-1 text-[12.5px] text-[#8C8270] dark:text-zinc-500">
            브로제이 출석관리 앱 스타일. 멘트/식별자/재입장/마일리지 등을 관리합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-[#6B7B3A] disabled:opacity-50 text-white text-[13px] font-semibold hover:bg-[#5a6932]"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </header>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      {savedMsg && (
        <div className="px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-[13px] text-emerald-700 dark:text-emerald-300">
          {savedMsg}
        </div>
      )}

      <Section title="안내 멘트">
        <p className="mb-3 text-[11.5px] text-[#A89B80]">
          각 상황에 맞춰 재생될 안내 문구예요. 빈 값이면 그 상황에는 재생하지 않습니다.
        </p>
        <div className="space-y-3">
          {MSG_FIELDS.map((f) => (
            <div key={f.key}>
              <div className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400 mb-1">
                {f.label}
              </div>
              <input
                type="text"
                value={(s[f.key] ?? "") as string}
                onChange={(e) => patch(f.key, e.target.value as never)}
                placeholder={f.placeholder}
                maxLength={200}
                className={crmInputClass}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section title="앱 동작">
        <ToggleRow
          label="사진촬영 권유"
          on={s.photo_suggest_enabled}
          onChange={(v) => patch("photo_suggest_enabled", v)}
        />
        <div>
          <div className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400 mb-1.5">
            식별자 사용
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip
              label="출석번호 사용"
              on={s.identifier_use_number}
              onClick={() => patch("identifier_use_number", !s.identifier_use_number)}
            />
            <Chip
              label="휴대폰번호 사용"
              on={s.identifier_use_phone}
              onClick={() => patch("identifier_use_phone", !s.identifier_use_phone)}
            />
            <Chip
              label="통합번호 사용"
              on={s.identifier_use_unified}
              onClick={() => patch("identifier_use_unified", !s.identifier_use_unified)}
            />
          </div>
        </div>
        <ToggleRow
          label="출석 모드 사용"
          on={s.attendance_mode_enabled}
          onChange={(v) => patch("attendance_mode_enabled", v)}
        />
        <ToggleRow
          label="직원 호출 사용"
          on={s.staff_call_enabled}
          onChange={(v) => patch("staff_call_enabled", v)}
        />
        <ToggleRow
          label="퇴장하기 기능 사용"
          on={s.exit_enabled}
          onChange={(v) => patch("exit_enabled", v)}
        />
      </Section>

      <Section title="재입장 · 마일리지">
        <div>
          <div className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400 mb-1.5">
            입장출석 재입장시간
          </div>
          <div className="flex items-center gap-2">
            <div className="relative max-w-[140px]">
              <input
                type="number"
                min={0}
                value={s.entry_reentry_minutes}
                onChange={(e) =>
                  patch("entry_reentry_minutes", Math.max(0, Number(e.target.value) || 0))
                }
                className={`${crmInputClass} pr-9`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#6B5D47] dark:text-zinc-400">
                분
              </span>
            </div>
            <span className="text-[11.5px] text-[#A89B80]">기본 180분</span>
          </div>
        </div>
        <ToggleRow
          label="수업출석 재입장시간 = 수업 종료시간 까지 (기본)"
          on={s.lesson_reentry_until_end}
          onChange={(v) => patch("lesson_reentry_until_end", v)}
        />
        <div>
          <div className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400 mb-1.5">
            출석 마일리지 적립
          </div>
          <div className="relative max-w-[160px]">
            <input
              type="number"
              min={0}
              value={s.attendance_mileage_earn}
              onChange={(e) =>
                patch("attendance_mileage_earn", Math.max(0, Number(e.target.value) || 0))
              }
              className={`${crmInputClass} pr-14`}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
              마일리지
            </span>
          </div>
        </div>
        <div>
          <div className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400 mb-1.5">
            이용권 &lsquo;만료 임박&rsquo; 기준
          </div>
          <div className="relative max-w-[160px]">
            <input
              type="number"
              min={0}
              value={s.expiring_threshold_days}
              onChange={(e) =>
                patch("expiring_threshold_days", Math.max(0, Number(e.target.value) || 0))
              }
              className={`${crmInputClass} pr-16`}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
              일 전
            </span>
          </div>
        </div>
      </Section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-5 py-2.5 rounded-lg bg-[#6B7B3A] disabled:opacity-50 text-white text-[14px] font-semibold hover:bg-[#5a6932]"
        >
          {saving ? "저장 중…" : "설정 저장"}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5">
      <h2 className="text-[14.5px] font-bold text-[#2A251D] dark:text-zinc-100 mb-3">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function ToggleRow({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <span className="text-[13.5px] text-[#3A342A] dark:text-zinc-300">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!on)}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          on ? "bg-[#6B7B3A]" : "bg-[#D9CDB8] dark:bg-zinc-700"
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
            on ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </label>
  );
}

function Chip({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold border transition-colors
        ${on
          ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
          : "border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300"
        }`}
    >
      {label}
    </button>
  );
}
