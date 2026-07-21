"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import {
  AUTO_MESSAGE_CATEGORIES,
  TRIGGER_BY_KEY,
  SEND_BASIS_LABEL,
  MESSAGE_VARIABLES,
  SEGMENT_OPTIONS,
  smsByteLength,
  smsKind,
  type SendBasis,
} from "@/app/lib/auto-message-triggers";

interface CouponAttach {
  name: string;
  link: string;
}
interface SettingConfig {
  attachments?: string[];
  coupon?: CouponAttach | null;
}
interface SettingRow {
  trigger_key: string;
  enabled: boolean;
  name: string | null;
  send_basis: string;
  send_days: number | null;
  send_count: number | null;
  methods: string[];
  audience: string[];
  message_body: string;
  coupon_id: number | null;
  config: SettingConfig;
}

/** 이미지 → 1440px 이하 · 300KB 이하 JPEG data URL 로 압축 */
async function compressImage(file: File, maxSize = 1440, maxBytes = 300 * 1024): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image();
      el.onload = () => res(el);
      el.onerror = rej;
      el.src = url;
    });
    let width = img.naturalWidth;
    let height = img.naturalHeight;
    if (width > maxSize || height > maxSize) {
      const r = Math.min(maxSize / width, maxSize / height);
      width = Math.round(width * r);
      height = Math.round(height * r);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 미지원");
    ctx.drawImage(img, 0, 0, width, height);
    let q = 0.85;
    let dataUrl = canvas.toDataURL("image/jpeg", q);
    while (dataUrl.length * 0.75 > maxBytes && q > 0.4) {
      q -= 0.1;
      dataUrl = canvas.toDataURL("image/jpeg", q);
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const METHOD_OPTIONS: { key: string; label: string }[] = [
  { key: "sms", label: "문자메시지" },
  { key: "push", label: "앱 푸시 알림" },
  { key: "smart", label: "스마트 전송" },
  { key: "alimtalk", label: "알림톡" },
];
const METHOD_LABEL: Record<string, string> = Object.fromEntries(METHOD_OPTIONS.map((m) => [m.key, m.label]));
const SEGMENT_LABEL: Record<string, string> = Object.fromEntries(SEGMENT_OPTIONS.map((s) => [s.key, s.label]));

export function AutoMessagesTab() {
  const { getIdToken } = useAuth();
  const [rows, setRows] = useState<Record<string, SettingRow>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editKey, setEditKey] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [scanSet, setScanSet] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState("");

  const loadMatches = useCallback(async () => {
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/auto-messages/matches", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      setCounts(data.counts ?? {});
      setScanSet(new Set<string>(data.scanTriggers ?? []));
    } catch {
      /* ignore */
    }
  }, [getIdToken]);

  const runNow = useCallback(async () => {
    setRunning(true);
    setRunMsg("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/auto-messages/run", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "실행 실패");
      setRunMsg(
        data.total > 0
          ? `평가 완료 · 조건에 맞는 ${data.total}명을 발송 대기열에 적재했어요. (실제 발송은 회원 앱 연동 후)`
          : "평가 완료 · 지금 조건에 해당하는 회원이 없어요."
      );
      loadMatches();
    } catch (e) {
      setRunMsg(e instanceof Error ? e.message : "실행 중 오류가 발생했어요.");
    } finally {
      setRunning(false);
    }
  }, [getIdToken, loadMatches]);

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
    loadMatches();
  }, [load, loadMatches]);

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
      <div className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FBF7EB]/50 dark:bg-zinc-900/50 px-4 py-3">
        <div className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed">
          상황별 자동 메세지를 켜 두면 조건이 충족될 때 회원에게 자동으로 발송됩니다.
          각 항목의 <span className="font-semibold text-[#3A342A] dark:text-zinc-200">설정</span>에서 발송 시점·문구를 정할 수 있어요.
          <br />
          <span className="text-[11.5px] text-[#A89B80]">실제 발송(회원 앱 푸시 등)은 회원용 앱 연동 시점에 대기열을 소비합니다. 지금은 대상 회원 매칭까지 동작해요.</span>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={runNow}
            disabled={running}
            className="px-3 py-1.5 rounded-lg bg-[#6B7B3A] text-white text-[12.5px] font-semibold hover:bg-[#5a6932] disabled:opacity-50"
          >
            {running ? "평가 중…" : "지금 평가 실행"}
          </button>
          {runMsg && <span className="text-[11.5px] text-[#4d5a29] dark:text-[#A8B87A]">{runMsg}</span>}
        </div>
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
                      {scanSet.has(t.key)
                        ? ` · 대상 ${counts[t.key] ?? 0}명`
                        : " · 이벤트 기반"}
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
    config: {},
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
  const name = base.name?.trim() || trigger.label; // 고정(수정 불가)

  const [enabled, setEnabled] = useState(base.enabled);
  const [sendBasis, setSendBasis] = useState<SendBasis>((base.send_basis as SendBasis) || "immediate");
  const [sendDays, setSendDays] = useState<number>(base.send_days ?? 3);
  const [sendCount, setSendCount] = useState<number>(base.send_count ?? 10);
  const [methods, setMethods] = useState<string[]>(base.methods ?? []);
  const [audience, setAudience] = useState<string[]>(base.audience ?? []);
  const [attachments, setAttachments] = useState<string[]>(base.config?.attachments ?? []);
  const [couponName, setCouponName] = useState(base.config?.coupon?.name ?? "");
  const [couponLink, setCouponLink] = useState(base.config?.coupon?.link ?? "");
  const [body, setBody] = useState(base.message_body ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const toggleSeg = (key: string) =>
    setAudience((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : prev.length >= 3 ? prev : [...prev, key]
    );

  const onPickFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      const room = Math.max(0, 2 - attachments.length);
      const picks = Array.from(files).filter((f) => /jpe?g/i.test(f.type)).slice(0, room);
      const out: string[] = [];
      for (const f of picks) {
        try {
          out.push(await compressImage(f));
        } catch {
          /* skip */
        }
      }
      setAttachments((prev) => [...prev, ...out].slice(0, 2));
    } finally {
      setUploading(false);
    }
  };

  const bytes = smsByteLength(body);
  const kind = smsKind(body);

  const submit = async () => {
    setSaving(true);
    try {
      await onSave({
        trigger_key: triggerKey,
        enabled,
        name,
        send_basis: sendBasis,
        send_days: sendBasis === "schedule" ? sendDays : null,
        send_count: sendBasis === "count" ? sendCount : null,
        methods,
        audience,
        message_body: body,
        config: {
          attachments,
          coupon: couponName.trim() ? { name: couponName.trim(), link: couponLink.trim() } : null,
        },
      });
    } finally {
      setSaving(false);
    }
  };

  const preview = (
    <MessagePreview
      name={name}
      body={body}
      bytes={bytes}
      kind={kind}
      methods={methods}
      attachments={attachments}
      couponName={couponName}
      couponLink={couponLink}
      sendBasis={sendBasis}
      sendDays={sendDays}
      sendCount={sendCount}
      audience={audience}
    />
  );

  const inputCls =
    "w-full px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px] text-[#2A251D] dark:text-zinc-100";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-6">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-5xl max-h-[94vh] flex flex-col rounded-2xl bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 shadow-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[#E8E0D0] dark:border-zinc-800">
          <div className="min-w-0">
            <div className="text-[11.5px] text-[#8C8270]">{cat?.label} &gt; {trigger.label}</div>
            <div className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100">자동알림 설정</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[12px] font-medium text-[#6B5D47] dark:text-zinc-400">사용 여부</span>
            <Switch on={enabled} onChange={setEnabled} />
          </div>
        </div>

        {/* 본문: 좌 폼 / 우 미리보기 */}
        <div className="flex-1 min-h-0 grid md:grid-cols-[minmax(0,1fr)_340px] overflow-hidden">
          <div className="overflow-y-auto px-5 py-4 space-y-5">
            {/* 01 자동알림명 (읽기 전용) */}
            <NumberedField no="01" title="자동알림명" hint="자동알림명은 고정이며 수정할 수 없습니다.">
              <div className="px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#F5F0E5]/50 dark:bg-zinc-800/50 text-[13.5px] font-medium text-[#6B5D47] dark:text-zinc-300">
                {name}
              </div>
            </NumberedField>

            {/* 02 수신 대상 */}
            <NumberedField no="02" title="수신 대상" hint="미선택 시 조건에 해당하는 전체 고객에게 발송됩니다. 최대 3개.">
              <div className="flex flex-wrap gap-2">
                {SEGMENT_OPTIONS.map((s) => {
                  const active = audience.includes(s.key);
                  const disabled = !active && audience.length >= 3;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleSeg(s.key)}
                      className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold border transition-colors disabled:opacity-30 ${
                        active
                          ? "border-[#6B7B3A] bg-[#6B7B3A]/10 text-[#4d5a29] dark:text-[#A8B87A]"
                          : "border-[#E8E0D0] dark:border-zinc-700 text-[#6B5D47] dark:text-zinc-300 bg-white dark:bg-zinc-900"
                      }`}
                    >
                      {active ? "✓ " : ""}{s.label}
                    </button>
                  );
                })}
              </div>
            </NumberedField>

            {/* 03 전송 기준 (모두 선택 가능) */}
            <NumberedField no="03" title="전송 기준">
              <div className="flex flex-wrap gap-2">
                {(["immediate", "schedule", "count"] as SendBasis[]).map((b) => {
                  const active = sendBasis === b;
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setSendBasis(b)}
                      className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold border transition-colors ${
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

            {/* 05 파일 첨부 */}
            <NumberedField no="05" title="파일 첨부" hint="1440×1440px 이하 · 각 300KB(최대 2장) · jpg/jpeg">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/jpg"
                multiple
                className="hidden"
                onChange={(e) => {
                  onPickFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                {attachments.map((src, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-[#E8E0D0] dark:border-zinc-700">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="첨부" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setAttachments((prev) => prev.filter((_, x) => x !== i))}
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white text-[10px] leading-none flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {attachments.length < 2 && (
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                    className="w-16 h-16 rounded-lg border border-dashed border-[#E8E0D0] dark:border-zinc-700 text-[11px] text-[#A89B80] hover:border-[#6B7B3A]/40 disabled:opacity-50"
                  >
                    {uploading ? "…" : "+ 이미지"}
                  </button>
                )}
              </div>
            </NumberedField>

            {/* 06 쿠폰 첨부 */}
            <NumberedField no="06" title="쿠폰 첨부" hint="쿠폰명과 링크를 입력하면 메세지에 함께 안내됩니다. 최대 1개.">
              <div className="space-y-2">
                <input
                  type="text"
                  value={couponName}
                  onChange={(e) => setCouponName(e.target.value.slice(0, 60))}
                  placeholder="쿠폰명 (예: 재등록 5% 할인)"
                  className={inputCls}
                />
                <input
                  type="text"
                  value={couponLink}
                  onChange={(e) => setCouponLink(e.target.value.slice(0, 300))}
                  placeholder="쿠폰 링크 (선택)"
                  className={inputCls}
                />
                {(couponName.trim() || couponLink.trim()) && (
                  <button
                    type="button"
                    onClick={() => { setCouponName(""); setCouponLink(""); }}
                    className="px-2 py-0.5 rounded-md border border-red-200 dark:border-red-900/60 text-[11.5px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    쿠폰 제거
                  </button>
                )}
              </div>
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
              <div className="mt-1.5 flex items-center justify-end text-[11.5px] text-[#8C8270]">
                <span>
                  <span className="font-semibold text-[#3A342A] dark:text-zinc-200">{bytes}</span> / 2000 Byte
                  <span className="ml-1.5 px-1.5 py-0.5 rounded bg-[#F5F0E5] dark:bg-zinc-800 text-[#6B5D47] dark:text-zinc-300">{kind}</span>
                </span>
              </div>
            </NumberedField>

            {/* 모바일: 미리보기 하단 표시 */}
            <div className="md:hidden">{preview}</div>
          </div>

          {/* 우측 미리보기 (데스크톱) */}
          <aside className="hidden md:block border-l border-[#E8E0D0] dark:border-zinc-800 bg-[#FBF7EB]/40 dark:bg-zinc-900/40 overflow-y-auto">
            {preview}
          </aside>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-[#E8E0D0] dark:border-zinc-800">
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

/* ─── 메세지 미리보기 (문자 발송 형태) ─────────────── */
function MessagePreview({
  name,
  body,
  bytes,
  kind,
  methods,
  attachments,
  couponName,
  couponLink,
  sendBasis,
  sendDays,
  sendCount,
  audience,
}: {
  name: string;
  body: string;
  bytes: number;
  kind: string;
  methods: string[];
  attachments: string[];
  couponName: string;
  couponLink: string;
  sendBasis: SendBasis;
  sendDays: number;
  sendCount: number;
  audience: string[];
}) {
  const basisText =
    sendBasis === "schedule" ? `일정 기준 ${sendDays}일` : sendBasis === "count" ? `횟수 기준 ${sendCount}회` : "즉시";
  return (
    <div className="p-4">
      <div className="text-[12px] font-bold text-[#2A251D] dark:text-zinc-100 mb-2">미리 보기</div>
      <div className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 overflow-hidden">
        <div className="px-3.5 py-2 border-b border-[#E8E0D0] dark:border-zinc-800 bg-[#F5F0E5]/60 dark:bg-zinc-800/40">
          <div className="text-[10.5px] text-[#8C8270]">발신 · 센터</div>
          <div className="text-[12.5px] font-semibold text-[#2A251D] dark:text-zinc-100 truncate">{name}</div>
        </div>
        <div className="px-3.5 py-3">
          <div className="rounded-xl bg-[#FBF7EB] dark:bg-zinc-800 px-3 py-2.5 text-[12.5px] leading-relaxed text-[#3A342A] dark:text-zinc-200 whitespace-pre-wrap break-words min-h-[64px]">
            {body.trim() ? body : <span className="text-[#A89B80]">메세지 내용이 여기에 표시됩니다.</span>}
          </div>
          {attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {attachments.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt="첨부" className="w-16 h-16 rounded-lg object-cover border border-[#E8E0D0] dark:border-zinc-700" />
              ))}
            </div>
          )}
          {couponName.trim() && (
            <div className="mt-2 px-3 py-2 rounded-lg border border-[#B47B2A]/40 bg-[#F5E4C8]/40 text-[11.5px] text-[#7a5518] leading-relaxed">
              🎫 쿠폰이 발급되었습니다
              <div className="font-semibold">{couponName}</div>
              {couponLink.trim() && <div className="text-[#6B7B3A] break-all">{couponLink}</div>}
            </div>
          )}
        </div>
        <div className="px-3.5 py-2 border-t border-[#E8E0D0] dark:border-zinc-800 flex items-center justify-between text-[10.5px] text-[#8C8270]">
          <span>{basisText}</span>
          <span>{bytes} Byte · {kind}</span>
        </div>
      </div>
      <div className="mt-2.5 space-y-1 text-[11px] text-[#6B5D47] dark:text-zinc-400">
        <div>
          전송 방법:{" "}
          {methods.length ? methods.map((m) => METHOD_LABEL[m]).join(", ") : <span className="text-[#A89B80]">미선택</span>}
        </div>
        <div>
          수신 대상:{" "}
          {audience.length ? audience.map((a) => SEGMENT_LABEL[a]).join(", ") : <span className="text-[#A89B80]">전체(조건 해당)</span>}
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
