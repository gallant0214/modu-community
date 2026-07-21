"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import {
  AUTO_MESSAGE_CATEGORIES,
  TRIGGER_BY_KEY,
  SEND_BASIS_LABEL,
  MESSAGE_VARIABLES,
  smsByteLength,
  smsKind,
  type SendBasis,
} from "@/app/lib/auto-message-triggers";

interface SettingRow {
  trigger_key: string;
  enabled: boolean;
  name: string | null;
  send_basis: string;
  send_days: number | null;
  send_count: number | null;
  methods: string[];
  audience: unknown[];
  message_body: string;
  coupon_id: number | null;
}

const METHOD_OPTIONS: { key: string; label: string }[] = [
  { key: "sms", label: "문자메시지" },
  { key: "push", label: "앱 푸시 알림" },
  { key: "smart", label: "스마트 전송" },
  { key: "alimtalk", label: "알림톡" },
];

export function AutoMessagesTab() {
  const { getIdToken } = useAuth();
  const [rows, setRows] = useState<Record<string, SettingRow>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editKey, setEditKey] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/auto-messages", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.status === 403) {
        setError("센터 관리자(대표자/관리자)만 자동 메세지를 설정할 수 있어요.");
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "불러오기 실패");
      const map: Record<string, SettingRow> = {};
      for (const r of data.settings ?? []) map[r.trigger_key] = r;
      setRows(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = useCallback(
    async (payload: Partial<SettingRow> & { trigger_key: string }): Promise<SettingRow | null> => {
      const token = await getIdToken();
      const res = await fetch("/api/crm/auto-messages", {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
      const saved = data.setting as SettingRow;
      setRows((prev) => ({ ...prev, [payload.trigger_key]: saved }));
      return saved;
    },
    [getIdToken]
  );

  const toggle = async (key: string, enabled: boolean) => {
    setSavingKey(key);
    // 낙관적 업데이트
    setRows((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? blankRow(key)), enabled },
    }));
    try {
      await patch({ trigger_key: key, enabled });
    } catch {
      // 실패 시 롤백
      setRows((prev) => ({
        ...prev,
        [key]: { ...(prev[key] ?? blankRow(key)), enabled: !enabled },
      }));
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return <div className="text-[13px] text-[#8C8270] py-8 text-center">불러오는 중…</div>;
  }
  if (error) {
    return (
      <div className="px-4 py-8 text-center text-[13px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-2xl">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FBF7EB]/50 dark:bg-zinc-900/50 px-4 py-3 text-[12.5px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed">
        상황별 자동 메세지를 켜 두면 조건이 충족될 때 회원에게 자동으로 발송됩니다.
        각 항목의 <span className="font-semibold text-[#3A342A] dark:text-zinc-200">설정</span>에서 발송 시점·문구를 정할 수 있어요.
        <br />
        <span className="text-[11.5px] text-[#A89B80]">실제 발송 채널(문자·앱 푸시·알림톡) 연동은 회원용 앱 출시와 함께 순차 적용됩니다.</span>
      </div>

      {AUTO_MESSAGE_CATEGORIES.map((cat) => (
        <section key={cat.key}>
          <h3 className="text-[13px] font-bold text-[#2A251D] dark:text-zinc-100 mb-2">{cat.label}</h3>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {cat.triggers.map((t) => {
              const row = rows[t.key];
              const on = !!row?.enabled;
              return (
                <li
                  key={t.key}
                  className={`flex items-center gap-3 px-3.5 py-3 rounded-xl border transition-colors ${
                    on
                      ? "border-[#6B7B3A]/50 bg-[#6B7B3A]/[0.06] dark:bg-[#6B7B3A]/10"
                      : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-[#2A251D] dark:text-zinc-100 truncate">
                      {row?.name?.trim() || t.label}
                    </div>
                    <div className="text-[11px] text-[#8C8270] dark:text-zinc-500 mt-0.5">
                      {on ? "사용 중" : "꺼짐"}
                      {row && ` · ${SEND_BASIS_LABEL[(row.send_basis as SendBasis) ?? "immediate"]}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditKey(t.key)}
                    className="shrink-0 px-2.5 py-1 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
                  >
                    설정
                  </button>
                  <Switch on={on} busy={savingKey === t.key} onChange={(v) => toggle(t.key, v)} />
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {editKey && (
        <AutoMessageEditor
          triggerKey={editKey}
          initial={rows[editKey] ?? null}
          onClose={() => setEditKey(null)}
          onSave={async (payload) => {
            await patch(payload);
            setEditKey(null);
          }}
        />
      )}
    </div>
  );
}

function blankRow(key: string): SettingRow {
  const t = TRIGGER_BY_KEY[key];
  return {
    trigger_key: key,
    enabled: false,
    name: t?.label ?? "",
    send_basis: t?.bases[0] ?? "immediate",
    send_days: null,
    send_count: null,
    methods: [],
    audience: [],
    message_body: t?.defaultBody ?? "",
    coupon_id: null,
  };
}

/* ─── on/off 스위치 ─────────────────────────────── */
function Switch({ on, busy, onChange }: { on: boolean; busy?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={() => onChange(!on)}
      className={`shrink-0 relative w-11 h-6 rounded-full transition-colors disabled:opacity-60 ${
        on ? "bg-[#6B7B3A]" : "bg-[#D9D2C4] dark:bg-zinc-700"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

/* ─── 자동알림 설정 편집 모달 ─────────────────────── */
function AutoMessageEditor({
  triggerKey,
  initial,
  onClose,
  onSave,
}: {
  triggerKey: string;
  initial: SettingRow | null;
  onClose: () => void;
  onSave: (payload: Partial<SettingRow> & { trigger_key: string }) => Promise<void>;
}) {
  const trigger = TRIGGER_BY_KEY[triggerKey];
  const cat = AUTO_MESSAGE_CATEGORIES.find((c) => c.triggers.some((t) => t.key === triggerKey));
  const base = initial ?? blankRow(triggerKey);

  const [enabled, setEnabled] = useState(base.enabled);
  const [name, setName] = useState(base.name ?? trigger?.label ?? "");
  const [sendBasis, setSendBasis] = useState<SendBasis>((base.send_basis as SendBasis) || trigger.bases[0]);
  const [sendDays, setSendDays] = useState<number>(base.send_days ?? 3);
  const [sendCount, setSendCount] = useState<number>(base.send_count ?? 10);
  const [methods, setMethods] = useState<string[]>(base.methods ?? []);
  const [body, setBody] = useState(base.message_body ?? "");
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const insertVar = (token: string) => {
    const el = bodyRef.current;
    if (!el) {
      setBody((b) => b + token);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const toggleMethod = (key: string) =>
    setMethods((prev) => (prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]));

  const bytes = smsByteLength(body);
  const kind = smsKind(body);

  const submit = async () => {
    setSaving(true);
    try {
      await onSave({
        trigger_key: triggerKey,
        enabled,
        name: name.trim() || trigger.label,
        send_basis: sendBasis,
        send_days: sendBasis === "schedule" ? sendDays : null,
        send_count: sendBasis === "count" ? sendCount : null,
        methods,
        message_body: body,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 md:p-6 overflow-y-auto">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-2xl my-4 rounded-2xl bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 shadow-2xl">
        {/* 헤더 */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7]/95 dark:bg-zinc-900/95 backdrop-blur rounded-t-2xl">
          <div className="min-w-0">
            <div className="text-[11.5px] text-[#8C8270]">{cat?.label} &gt; {trigger.label}</div>
            <div className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100">자동알림 설정</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[12px] font-medium text-[#6B5D47] dark:text-zinc-400">사용 여부</span>
            <Switch on={enabled} onChange={setEnabled} />
          </div>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* 01 자동알림명 */}
          <NumberedField no="01" title="자동알림명">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 100))}
              placeholder={trigger.label}
              className="w-full px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13.5px] text-[#2A251D] dark:text-zinc-100"
            />
          </NumberedField>

          {/* 02 수신 대상 (준비중) */}
          <NumberedField no="02" title="수신 대상" hint="세그먼트 기능은 준비중입니다. 현재는 조건에 해당하는 전체 고객에게 발송됩니다.">
            <div className="px-3 py-2.5 rounded-lg border border-dashed border-[#E8E0D0] dark:border-zinc-700 text-[12.5px] text-[#A89B80] bg-[#FBF7EB]/40 dark:bg-zinc-900/40">
              세그먼트 선택 (준비중) · 최대 3개
            </div>
          </NumberedField>

          {/* 03 전송 기준 */}
          <NumberedField no="03" title="전송 기준">
            <div className="flex flex-wrap gap-2">
              {(["immediate", "schedule", "count"] as SendBasis[]).map((b) => {
                const allowed = trigger.bases.includes(b);
                const active = sendBasis === b;
                return (
                  <button
                    key={b}
                    type="button"
                    disabled={!allowed}
                    onClick={() => setSendBasis(b)}
                    className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                      active
                        ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
                        : "border-[#E8E0D0] dark:border-zinc-700 text-[#6B5D47] dark:text-zinc-300 bg-white dark:bg-zinc-900"
                    }`}
                  >
                    {SEND_BASIS_LABEL[b]}
                  </button>
                );
              })}
            </div>
            {sendBasis === "schedule" && (
              <div className="mt-2.5 flex items-center gap-2 text-[13px] text-[#3A342A] dark:text-zinc-200">
                <span>기준일</span>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={sendDays}
                  onChange={(e) => setSendDays(Math.max(0, Math.min(365, Number(e.target.value) || 0)))}
                  className="w-20 px-2 py-1 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px]"
                />
                <span>일 (만료·생일 등 기준 전/후)</span>
              </div>
            )}
            {sendBasis === "count" && (
              <div className="mt-2.5 flex items-center gap-2 text-[13px] text-[#3A342A] dark:text-zinc-200">
                <span>기준 횟수</span>
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={sendCount}
                  onChange={(e) => setSendCount(Math.max(0, Math.min(999, Number(e.target.value) || 0)))}
                  className="w-20 px-2 py-1 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px]"
                />
                <span>회 (미출석 등)</span>
              </div>
            )}
            {trigger.bases.length === 1 && trigger.bases[0] === "immediate" && (
              <p className="mt-1.5 text-[11.5px] text-[#A89B80]">‘{trigger.label}’은 즉시 전송만 가능합니다.</p>
            )}
          </NumberedField>

          {/* 04 전송 방법 */}
          <NumberedField no="04" title="전송 방법" hint="실제 발송 채널 연동은 준비중입니다. 선택값은 미리 저장돼요.">
            <div className="flex flex-wrap gap-2">
              {METHOD_OPTIONS.map((m) => {
                const active = methods.includes(m.key);
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => toggleMethod(m.key)}
                    className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold border transition-colors ${
                      active
                        ? "border-[#6B7B3A] bg-[#6B7B3A]/10 text-[#4d5a29] dark:text-[#A8B87A]"
                        : "border-[#E8E0D0] dark:border-zinc-700 text-[#6B5D47] dark:text-zinc-300 bg-white dark:bg-zinc-900"
                    }`}
                  >
                    {active ? "✓ " : ""}{m.label}
                  </button>
                );
              })}
            </div>
          </NumberedField>

          {/* 05 파일 첨부 (준비중) */}
          <NumberedField no="05" title="파일 첨부" hint="1440×1440px 이하 · 각 300KB(최대 2장) · jpg/jpeg">
            <button
              type="button"
              disabled
              className="px-3 py-2 rounded-lg border border-dashed border-[#E8E0D0] dark:border-zinc-700 text-[12.5px] text-[#A89B80] cursor-not-allowed"
            >
              이미지 선택하기 (준비중)
            </button>
          </NumberedField>

          {/* 06 쿠폰 첨부 (준비중) */}
          <NumberedField no="06" title="쿠폰 첨부" hint="쿠폰 관리 기능 연동 후 제공됩니다. 최대 1개.">
            <button
              type="button"
              disabled
              className="px-3 py-2 rounded-lg border border-dashed border-[#E8E0D0] dark:border-zinc-700 text-[12.5px] text-[#A89B80] cursor-not-allowed"
            >
              쿠폰 선택 (준비중)
            </button>
          </NumberedField>

          {/* 07 메세지 입력 */}
          <NumberedField no="07" title="메세지 입력">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {MESSAGE_VARIABLES.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  onClick={() => insertVar(v.token)}
                  title={v.desc}
                  className="px-2 py-1 rounded-md text-[11.5px] font-semibold border border-[#E8E0D0] dark:border-zinc-700 text-[#6B7B3A] dark:text-[#A8B87A] bg-white dark:bg-zinc-900 hover:bg-[#6B7B3A]/5"
                >
                  {v.token}
                </button>
              ))}
            </div>
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 2000))}
              rows={10}
              placeholder="회원에게 보낼 메세지를 입력하세요. 위 변수를 눌러 자동 삽입할 수 있어요."
              className="w-full px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px] leading-relaxed text-[#2A251D] dark:text-zinc-100 resize-y"
            />
            <div className="mt-1.5 flex items-center justify-between text-[11.5px] text-[#8C8270]">
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                className="font-semibold text-[#6B7B3A] dark:text-[#A8B87A] hover:underline"
              >
                {showPreview ? "미리보기 닫기" : "미리보기"}
              </button>
              <span>
                <span className="font-semibold text-[#3A342A] dark:text-zinc-200">{bytes}</span> / 2000 Byte
                <span className="ml-1.5 px-1.5 py-0.5 rounded bg-[#F5F0E5] dark:bg-zinc-800 text-[#6B5D47] dark:text-zinc-300">{kind}</span>
              </span>
            </div>
            {showPreview && (
              <div className="mt-2 px-3.5 py-3 rounded-lg border border-[#E8E0D0] dark:border-zinc-800 bg-[#FBF7EB]/60 dark:bg-zinc-900/60 text-[12.5px] leading-relaxed text-[#3A342A] dark:text-zinc-200 whitespace-pre-wrap">
                {body.trim() ? body : <span className="text-[#A89B80]">내용이 비어 있습니다.</span>}
              </div>
            )}
          </NumberedField>
        </div>

        {/* 푸터 */}
        <div className="sticky bottom-0 flex items-center justify-end gap-2 px-5 py-3.5 border-t border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7]/95 dark:bg-zinc-900/95 backdrop-blur rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932] disabled:opacity-50"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NumberedField({
  no,
  title,
  hint,
  children,
}: {
  no: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A] text-[10.5px] font-bold">
          {no}
        </span>
        <span className="text-[13px] font-semibold text-[#2A251D] dark:text-zinc-100">{title}</span>
      </div>
      {children}
      {hint && <p className="mt-1.5 text-[11px] text-[#A89B80] leading-relaxed">* {hint}</p>}
    </div>
  );
}
