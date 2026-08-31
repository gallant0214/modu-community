"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { crmInputClass } from "../_components/crm-modal";
import { previewSpeak } from "../touch-attendance/_speak";

interface Settings {
  center_id: number;
  msg_active_entry: string;
  msg_active_entry_enabled: boolean;
  msg_birthday_entry: string;
  msg_birthday_entry_enabled: boolean;
  msg_expiring_membership: string;
  msg_expiring_membership_enabled: boolean;
  msg_exit: string;
  msg_exit_enabled: boolean;
  msg_outstanding: string;
  msg_outstanding_enabled: boolean;
  msg_expired_membership: string;
  msg_expired_membership_enabled: boolean;
  msg_expired_rental: string;
  msg_expired_rental_enabled: boolean;
  msg_expired_rental_days: number;
  msg_expired_locker: string;
  msg_expired_locker_enabled: boolean;
  msg_expired_locker_days: number;
  msg_holding: string;
  msg_holding_enabled: boolean;
  msg_scheduled_membership: string;
  msg_scheduled_membership_enabled: boolean;
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
  face_threshold: number;
}

const MSG_FIELDS: {
  key: keyof Settings;
  enabledKey: keyof Settings;
  label: string;
  placeholder: string;
  hint?: string;
  daysKey?: keyof Settings;
  daysBefore?: boolean; // true=만료 N일 전부터(임박), false=만료 후 N일까지
}[] = [
  { key: "msg_active_entry", enabledKey: "msg_active_entry_enabled", label: "활성 회원 입장 시 안내 멘트", placeholder: "예: 출석 포인트가 적립되었습니다" },
  { key: "msg_birthday_entry", enabledKey: "msg_birthday_entry_enabled", label: "생일자 회원 입장 시 안내 멘트", placeholder: "예: 생일 축하드립니다" },
  { key: "msg_expiring_membership", enabledKey: "msg_expiring_membership_enabled", daysKey: "expiring_threshold_days", daysBefore: true, label: "만료 임박 [멤버십] 회원 입장 시 안내 멘트", placeholder: "예: 회원권이 곧 만료 예정입니다", hint: "만료일이 가까운 회원이 체크인 할 때 매번 재생. 아래에서 만료 며칠 전부터 안내할지 설정하세요." },
  { key: "msg_exit", enabledKey: "msg_exit_enabled", label: "퇴장 멘트", placeholder: "예: 퇴실 포인트가 적립되었습니다" },
  { key: "msg_outstanding", enabledKey: "msg_outstanding_enabled", label: "미수금 멘트", placeholder: "멘트를 입력해주세요." },
  { key: "msg_expired_membership", enabledKey: "msg_expired_membership_enabled", label: "만료 회원 입장 시 안내 멘트", placeholder: "예: 회원권이 만료되었습니다. 카운터에 문의주세요!", hint: "회원권이 유효기간을 지난 회원이 체크인할 때마다 재생" },
  { key: "msg_expired_rental", enabledKey: "msg_expired_rental_enabled", daysKey: "msg_expired_rental_days", label: "운동복 만료 멘트", placeholder: "예: 운동복이 만료되었습니다. 카운터에 문의주세요!", hint: "운동복(대여권)이 만료된 회원이 체크인할 때 재생. 아래에서 만료 후 며칠까지 안내할지 설정하세요." },
  { key: "msg_expired_locker", enabledKey: "msg_expired_locker_enabled", daysKey: "msg_expired_locker_days", label: "락커 만료 멘트", placeholder: "예: 락커가 만료되었습니다. 카운터에 문의주세요!", hint: "락커가 만료된 회원이 체크인할 때 재생. 아래에서 만료 후 며칠까지 안내할지 설정하세요." },
  { key: "msg_holding", enabledKey: "msg_holding_enabled", label: "홀딩 회원 입장 시 안내 멘트", placeholder: "멘트를 입력해주세요." },
  { key: "msg_scheduled_membership", enabledKey: "msg_scheduled_membership_enabled", label: "예정 [멤버십] 회원 입장 시 안내 멘트", placeholder: "멘트를 입력해주세요." },
];

export default function TouchAttendanceSettingsPage() {
  const { getIdToken } = useAuth();
  const [s, setS] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");
  // 미리듣기 진단 안내(미지원/한국어 음성 없음 등)
  const [voiceNote, setVoiceNote] = useState("");

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

      <KioskLinkSection />

      <Section title="안내 멘트">
        <p className="mb-3 text-[11.5px] text-[#A89B80]">
          각 상황에 맞춰 재생될 안내 문구예요. 빈 값이면 그 상황에는 재생하지 않습니다.
        </p>
        {voiceNote && (
          <div className="mb-3 flex items-start justify-between gap-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-[12px] leading-relaxed text-amber-800 dark:text-amber-300">
            <span>{voiceNote}</span>
            <button
              type="button"
              onClick={() => setVoiceNote("")}
              className="shrink-0 text-amber-500 hover:text-amber-700"
              aria-label="닫기"
            >
              ✕
            </button>
          </div>
        )}
        <div className="space-y-4">
          {MSG_FIELDS.map((f) => {
            const on = Boolean(s[f.enabledKey] as boolean);
            return (
              <div
                key={f.key as string}
                className={`rounded-xl border p-3 ${
                  on
                    ? "border-[#E8E0D0] dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/60"
                    : "border-[#E8E0D0]/50 dark:border-zinc-800/50 bg-[#F5F0E5]/40 dark:bg-zinc-900/40 opacity-70"
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="text-[12.5px] font-semibold text-[#3A342A] dark:text-zinc-200">
                    {f.label}
                  </div>
                  <button
                    type="button"
                    onClick={() => patch(f.enabledKey, !on as never)}
                    aria-label={on ? "끄기" : "켜기"}
                    className={`relative w-10 h-5.5 rounded-full transition-colors shrink-0 ${
                      on ? "bg-[#6B7B3A]" : "bg-[#D9CDB8] dark:bg-zinc-700"
                    }`}
                    style={{ width: 40, height: 22 }}
                  >
                    <span
                      className={`absolute top-0.5 w-[18px] h-[18px] rounded-full bg-white shadow transition-all ${
                        on ? "left-[20px]" : "left-0.5"
                      }`}
                    />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    disabled={!on}
                    value={(s[f.key] ?? "") as string}
                    onChange={(e) => patch(f.key, e.target.value as never)}
                    placeholder={f.placeholder}
                    maxLength={200}
                    className={`${crmInputClass} disabled:opacity-60`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const text =
                        String(s[f.key] ?? "").trim() ||
                        f.placeholder.replace(/^예:\s*/, "");
                      const r = previewSpeak(text);
                      if (r.status === "unsupported") {
                        setVoiceNote(
                          "이 브라우저는 음성 재생을 지원하지 않아요. 크롬 또는 엣지에서 열어 주세요."
                        );
                      } else if (r.status === "no-voice-fallback") {
                        setVoiceNote(
                          "이 PC에 한국어 음성이 설치돼 있지 않아 기본 음성으로 재생됩니다. " +
                            "Windows: 설정 → 시간 및 언어 → 언어 및 지역 → 한국어 → 옵션 → 음성 추가 / " +
                            "Mac: 시스템 설정 → 손쉬운 사용 → 말하기(음성 콘텐츠)에서 한국어 음성 다운로드. " +
                            "실제 출석 태블릿에 한국어 음성이 있으면 정상 재생됩니다."
                        );
                      } else {
                        setVoiceNote("");
                      }
                    }}
                    disabled={!on}
                    title="입력한 멘트를 음성으로 미리 들어보기"
                    className="shrink-0 inline-flex items-center gap-1 px-3 py-2.5 rounded-lg border border-[#6B7B3A] text-[#6B7B3A] dark:text-[#A8B87A] text-[12.5px] font-semibold hover:bg-[#6B7B3A]/5 disabled:opacity-40"
                  >
                    ▶ 미리듣기
                  </button>
                </div>
                {f.daysKey && (
                  <div className={`mt-2 flex items-center gap-2 ${on ? "" : "opacity-60"}`}>
                    <span className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
                      {f.daysBefore ? "만료" : "만료 후"}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={365}
                      disabled={!on}
                      value={Number(s[f.daysKey] ?? 0)}
                      onChange={(e) => patch(f.daysKey!, Math.max(0, Math.min(365, Number(e.target.value) || 0)) as never)}
                      className="w-20 px-2.5 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[14px] text-right tabular-nums disabled:opacity-60"
                    />
                    <span className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
                      {f.daysBefore ? "일 전부터 안내" : "일까지 안내"}
                    </span>
                    {!f.daysBefore && <span className="text-[11px] text-[#A89B80]">(0 = 만료 후 계속)</span>}
                  </div>
                )}
                {f.hint && (
                  <p className="mt-1.5 text-[11px] text-[#A89B80]">{f.hint}</p>
                )}
              </div>
            );
          })}
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

      <Section title="얼굴 인식 정밀도">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[13px] font-semibold text-[#3A342A] dark:text-zinc-200">
              인식 정밀도(임계값)
            </div>
            <div className="tabular-nums text-[14px] font-bold text-[#6B7B3A] dark:text-[#A8B87A]">
              {(Number(s.face_threshold) || 0.45).toFixed(2)}
            </div>
          </div>
          <input
            type="range"
            min={0.35}
            max={0.6}
            step={0.01}
            value={Number(s.face_threshold) || 0.45}
            onChange={(e) => patch("face_threshold", Number(e.target.value))}
            className="w-full accent-[#6B7B3A]"
          />
          <div className="mt-1 flex justify-between text-[11.5px] text-[#A89B80]">
            <span>← 엄격 (오인식 ↓)</span>
            <span>관대 (본인 인식 ↑) →</span>
          </div>
          <p className="mt-2 text-[11.5px] text-[#A89B80] leading-relaxed">
            다른 사람이 출석되면 값을 <strong>낮추고</strong>, 본인이 인식 안 되면 <strong>올리세요</strong>. (권장 0.42 ~ 0.48)
          </p>
        </div>
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
        {/* '만료 임박' 기준일(며칠 전부터) 은 위 '만료 임박 [멤버십]' 멘트 아래 입력으로 이동함 */}
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

/** 공개 터치출석 링크(로그인 없이 접근) 발급·복사·재발급 */
function KioskLinkSection() {
  const { getIdToken } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const t = await getIdToken();
        if (!t) return;
        const res = await fetch("/api/crm/kiosk-link", {
          headers: { authorization: `Bearer ${t}` },
          cache: "no-store",
        });
        if (res.ok) {
          const d = await res.json();
          setToken(d.token ?? null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [getIdToken]);

  const link =
    token && typeof window !== "undefined" ? `${window.location.origin}/touch/${token}` : "";

  const generate = async (regenerate: boolean) => {
    if (regenerate && !window.confirm("기존 링크가 즉시 무효화되고 새 링크가 만들어져요. 계속할까요?")) return;
    setBusy(true);
    setErr("");
    try {
      const t = await getIdToken();
      const res = await fetch("/api/crm/kiosk-link", {
        method: "POST",
        headers: { authorization: `Bearer ${t}` },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "발급 실패");
      setToken(d.token);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <Section title="공개 터치출석 링크 (로그인 없이 접속)">
      <p className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
        이 링크로 열면 로그인 없이 이 센터의 터치출석 화면(번호·얼굴·번호+얼굴)이 열려요.
        태블릿·키오스크를 그 링크로 열어두면 회원이 바로 출석할 수 있어요.
        <br />
        <span className="text-[#B47B2A]">
          링크에 접근 권한이 담겨 있으니 외부에 노출되지 않게 관리하세요. 유출되면 아래에서 재발급하면 됩니다.
        </span>
      </p>
      {loading ? (
        <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : token ? (
        <>
          <div className="px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB] dark:bg-zinc-950 break-all text-[12.5px] font-mono text-[#3A342A] dark:text-zinc-200">
            {link}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copy}
              className="px-4 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932]"
            >
              {copied ? "복사됨!" : "링크 복사"}
            </button>
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13px] font-semibold text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5]"
            >
              새 창에서 열기
            </a>
            <button
              type="button"
              onClick={() => generate(true)}
              disabled={busy}
              className="px-4 py-2 rounded-lg border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-[13px] font-semibold hover:bg-red-50 disabled:opacity-50"
            >
              {busy ? "처리 중…" : "링크 재발급"}
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => generate(false)}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932] disabled:opacity-50"
        >
          {busy ? "생성 중…" : "공개 링크 생성"}
        </button>
      )}
      {err && <div className="text-[12.5px] text-red-700 dark:text-red-300">{err}</div>}
    </Section>
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
