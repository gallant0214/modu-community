"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { crmInputClass } from "../_components/crm-modal";
import { formatPhone } from "../_components/crm-labels";

type AudienceKind = "all" | "active" | "dormant" | "expiring" | "expired" | "unassigned" | "individual";

interface Broadcast {
  id: number;
  title: string;
  body: string;
  audience_kind: AudienceKind;
  audience_filter: { member_ids?: number[]; within_days?: number; inactive_days?: number } | null;
  recipient_count: number;
  sent_by_name: string | null;
  created_at: string;
  read_count: number;
}

interface MemberOption {
  id: number;
  name: string;
  phone: string | null;
}

const AUDIENCE_OPTIONS: { key: AudienceKind; label: string; desc: string }[] = [
  { key: "all", label: "전체 회원", desc: "센터에 등록된 활성 회원 전체" },
  { key: "active", label: "유효 회원", desc: "오늘 기준 활성 수강권 또는 회원권 보유" },
  { key: "dormant", label: "장기 미출석 회원", desc: "유효 회원 중 지정 일수 이상 미출석" },
  { key: "expiring", label: "만료 임박", desc: "지정 일수 이내 만료 예정" },
  { key: "expired", label: "만료 회원", desc: "활성 상품 없음 (과거 이력 있음)" },
  { key: "unassigned", label: "미가입 회원", desc: "수강권/회원권 이력 없음" },
  { key: "individual", label: "개별 선택", desc: "회원을 직접 검색·선택" },
];

const AUDIENCE_LABEL = Object.fromEntries(
  AUDIENCE_OPTIONS.map((o) => [o.key, o.label])
) as Record<AudienceKind, string>;

export default function CrmMessagesPage() {
  const { getIdToken } = useAuth();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<AudienceKind>("all");
  const [withinDays, setWithinDays] = useState(7);
  const [inactiveDays, setInactiveDays] = useState(14);
  const [selectedMembers, setSelectedMembers] = useState<MemberOption[]>([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<MemberOption[]>([]);
  const [searching, setSearching] = useState(false);

  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const [history, setHistory] = useState<Broadcast[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/crm/messages", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.broadcasts ?? []);
      }
    } finally {
      setLoadingHistory(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // 미리보기 카운트 (audience 변경 시 자동)
  const refreshPreview = useCallback(async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/crm/messages/preview", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          audience_kind: audience,
          member_ids: selectedMembers.map((m) => m.id),
          within_days: withinDays,
          inactive_days: inactiveDays,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewCount(data.count ?? 0);
      }
    } catch {
      /* ignore */
    }
  }, [audience, selectedMembers, withinDays, inactiveDays, getIdToken]);

  useEffect(() => {
    refreshPreview();
  }, [refreshPreview]);

  const searchMembers = useCallback(
    async (raw?: string) => {
      const q = (raw ?? memberQuery).trim();
      if (!q) {
        setMemberResults([]);
        return;
      }
      setSearching(true);
      try {
        const token = await getIdToken();
        const res = await fetch(`/api/crm/members?q=${encodeURIComponent(q)}&limit=30`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setMemberResults(data.members ?? []);
        }
      } finally {
        setSearching(false);
      }
    },
    [memberQuery, getIdToken]
  );

  // 개별 선택: 입력 즉시 검색(디바운스 300ms)
  useEffect(() => {
    if (audience !== "individual") return;
    const q = memberQuery.trim();
    if (!q) {
      setMemberResults([]);
      return;
    }
    const t = setTimeout(() => searchMembers(q), 300);
    return () => clearTimeout(t);
  }, [memberQuery, audience, searchMembers]);

  const addMember = (m: MemberOption) => {
    if (selectedMembers.some((x) => x.id === m.id)) return;
    setSelectedMembers((prev) => [...prev, m]);
    setMemberQuery("");
    setMemberResults([]);
  };
  const removeMember = (id: number) =>
    setSelectedMembers((prev) => prev.filter((m) => m.id !== id));

  const send = async () => {
    setError("");
    setOkMsg("");
    if (!title.trim()) return setError("제목을 입력해 주세요");
    if (!body.trim()) return setError("내용을 입력해 주세요");
    if (audience === "individual" && selectedMembers.length === 0)
      return setError("받을 회원을 최소 1명 선택해 주세요");
    if (previewCount === 0) return setError("받을 회원이 없어요");

    if (!window.confirm(`${previewCount ?? "?"}명에게 발송할까요?`)) return;

    setSending(true);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/messages", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          audience_kind: audience,
          member_ids: selectedMembers.map((m) => m.id),
          within_days: withinDays,
          inactive_days: inactiveDays,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "발송 실패");
      setOkMsg(`${data.recipient_count}명에게 발송했어요.`);
      setTitle("");
      setBody("");
      if (audience === "individual") setSelectedMembers([]);
      loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSending(false);
    }
  };

  const audienceLabel = useMemo(() => {
    if (audience === "individual") return `개별 ${selectedMembers.length}명`;
    if (audience === "expiring") return `${AUDIENCE_LABEL.expiring} (${withinDays}일 이내)`;
    if (audience === "dormant") return `${AUDIENCE_LABEL.dormant} (${inactiveDays}일 이상)`;
    return AUDIENCE_LABEL[audience];
  }, [audience, selectedMembers, withinDays, inactiveDays]);

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-4xl mx-auto">
      <header className="mb-5">
        <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
          메세지 전송
        </h1>
        <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
          회원 그룹에게 공지를 전송해요. 회원용 앱이 준비되면 앱 알림으로도 자동 전달됩니다.
        </p>
      </header>

      {/* 대상 선택 */}
      <Section title="1. 발송 대상">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {AUDIENCE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setAudience(opt.key)}
              className={`text-left px-3 py-2.5 rounded-xl border transition-colors
                ${audience === opt.key
                  ? "border-[#6B7B3A] bg-[#6B7B3A]/10 dark:bg-[#6B7B3A]/20"
                  : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 hover:border-[#6B7B3A]/40"
                }`}
            >
              <div className="text-[13px] font-semibold text-[#2A251D] dark:text-zinc-100">
                {opt.label}
              </div>
              <div className="text-[11.5px] text-[#8C8270] dark:text-zinc-400 mt-0.5">
                {opt.desc}
              </div>
            </button>
          ))}
        </div>

        {audience === "expiring" && (
          <div className="mt-3 flex items-center gap-2 text-[13px] text-[#3A342A] dark:text-zinc-200">
            <span>만료</span>
            <input
              type="number"
              min={1}
              max={60}
              value={withinDays}
              onChange={(e) => setWithinDays(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
              className={`${crmInputClass} !w-20`}
            />
            <span>일 이내</span>
          </div>
        )}

        {audience === "dormant" && (
          <div className="mt-3 flex items-center gap-2 text-[13px] text-[#3A342A] dark:text-zinc-200">
            <span>최근</span>
            <input
              type="number"
              min={1}
              max={365}
              value={inactiveDays}
              onChange={(e) => setInactiveDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
              className={`${crmInputClass} !w-20`}
            />
            <span>일 이상 미출석 (출석 이력 없는 유효 회원 포함)</span>
          </div>
        )}

        {audience === "individual" && (
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={memberQuery}
                onChange={(e) => setMemberQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    searchMembers();
                  }
                }}
                placeholder="이름 또는 연락처 검색"
                className={`${crmInputClass} flex-1`}
              />
              <button
                type="button"
                onClick={() => searchMembers()}
                disabled={searching}
                className="px-4 rounded-lg bg-[#6B5D47] text-white text-[13px] font-semibold disabled:opacity-60"
              >
                {searching ? "검색 중…" : "검색"}
              </button>
            </div>
            {memberQuery.trim() && !searching && memberResults.length === 0 && (
              <div className="px-3 py-2 text-[12.5px] text-[#8C8270] text-center border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-lg">
                검색 결과가 없어요. 이름 또는 연락처를 확인해 주세요.
              </div>
            )}
            {memberResults.length > 0 && (
              <ul className="rounded-lg border border-[#E8E0D0] dark:border-zinc-700 max-h-40 overflow-y-auto">
                {memberResults
                  .filter((m) => !selectedMembers.some((s) => s.id === m.id))
                  .map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => addMember(m)}
                      className="w-full text-left px-3 py-2 border-b border-[#E8E0D0]/60 dark:border-zinc-800 hover:bg-[#FBF7EB]"
                    >
                      <span className="text-[13px] font-medium text-[#2A251D] dark:text-zinc-100">
                        {m.name}
                      </span>
                      {m.phone && (
                        <span className="ml-2 text-[11.5px] text-[#8C8270]">
                          {formatPhone(m.phone)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selectedMembers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {selectedMembers.map((m) => (
                  <span
                    key={m.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] bg-[#6B7B3A]/10 text-[#6B7B3A] dark:bg-[#6B7B3A]/25 dark:text-[#A8B87A] border border-[#6B7B3A]/30"
                  >
                    {m.name}
                    <button
                      type="button"
                      onClick={() => removeMember(m.id)}
                      className="ml-1 hover:text-red-600"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-3 px-3 py-2 rounded-lg bg-[#FBF7EB] dark:bg-zinc-900/60 text-[12.5px] text-[#3A342A] dark:text-zinc-300">
          받을 회원:{" "}
          <strong className="text-[#6B7B3A] dark:text-[#A8B87A]">
            {previewCount ?? "…"}명
          </strong>
          <span className="ml-2 text-[#8C8270]">({audienceLabel})</span>
        </div>
      </Section>

      {/* 메시지 작성 */}
      <Section title="2. 메시지">
        <FieldLabel>제목</FieldLabel>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 60))}
          placeholder="예: 6월 휴관 안내"
          maxLength={60}
          className={crmInputClass}
        />
        <div className="text-right text-[11px] text-[#A89B80] mt-0.5">{title.length}/60</div>

        <FieldLabel>내용</FieldLabel>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 2000))}
          rows={6}
          placeholder="회원에게 안내할 내용을 입력해 주세요."
          maxLength={2000}
          className={`${crmInputClass} resize-none`}
        />
        <div className="text-right text-[11px] text-[#A89B80] mt-0.5">{body.length}/2000</div>
      </Section>

      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      {okMsg && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-[#6B7B3A]/10 text-[13px] text-[#6B7B3A] dark:text-[#A8B87A]">
          {okMsg}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pb-8">
        <button
          type="button"
          onClick={send}
          disabled={sending || previewCount === 0}
          className="px-6 py-2.5 rounded-lg bg-[#6B7B3A] text-white text-[14px] font-semibold hover:bg-[#5a6932] disabled:opacity-50"
        >
          {sending ? "발송 중…" : "발송"}
        </button>
      </div>

      {/* 발송 이력 */}
      <div className="mt-2">
        <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-2">
          지난 발송 이력
        </h2>
        {loadingHistory ? (
          <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
        ) : history.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12.5px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
            아직 발송 기록이 없어요.
          </div>
        ) : (
          <ul className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 overflow-hidden divide-y divide-[#E8E0D0]/70 dark:divide-zinc-800">
            {history.map((b) => (
              <li key={b.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#6B7B3A]/10 text-[#6B7B3A] dark:bg-[#6B7B3A]/25 dark:text-[#A8B87A] border border-[#6B7B3A]/30">
                      {AUDIENCE_LABEL[b.audience_kind] ?? b.audience_kind}
                    </span>
                    <span className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 truncate">
                      {b.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11.5px] text-[#8C8270]">
                    <span>{b.recipient_count}명</span>
                    <span>·</span>
                    <span>읽음 {b.read_count}</span>
                    <span>·</span>
                    <span>{formatDateTime(b.created_at)}</span>
                  </div>
                </div>
                {b.body && (
                  <div className="mt-1.5 text-[12.5px] text-[#6B5D47] dark:text-zinc-400 whitespace-pre-wrap line-clamp-3">
                    {b.body}
                  </div>
                )}
                {b.sent_by_name && (
                  <div className="mt-1 text-[11px] text-[#A89B80]">발송자: {b.sent_by_name}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 px-4 py-4 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
      <h2 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-3">{title}</h2>
      {children}
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[12.5px] font-medium text-[#6B5D47] dark:text-zinc-400 mb-1.5 mt-2">
      {children}
    </div>
  );
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    const k = new Date(d.getTime() + 9 * 3600 * 1000);
    const y = k.getUTCFullYear();
    const m = String(k.getUTCMonth() + 1).padStart(2, "0");
    const day = String(k.getUTCDate()).padStart(2, "0");
    const hh = String(k.getUTCHours()).padStart(2, "0");
    const mm = String(k.getUTCMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${hh}:${mm}`;
  } catch {
    return iso;
  }
}
