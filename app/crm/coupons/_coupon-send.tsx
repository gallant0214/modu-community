"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SMS_NOT_READY_MESSAGE } from "@/app/lib/crm-sms-availability";
import { useAuth } from "@/app/components/auth-provider";
import { crmInputClass } from "../_components/crm-modal";
import { formatPhone } from "../_components/crm-labels";
import { VarHintBubble, type VarDef } from "../_components/message-var-hint";
import {
  COUPON_CONDITION_VAR,
  COUPON_SEND_COUPON_TOKENS,
  COUPON_SEND_MEMBER_TOKENS,
  benefitText,
  conditionText,
  defaultCouponMessage,
  fillCouponCondition,
  issueExpiryYmd,
} from "@/app/lib/crm-coupons";
import { MESSAGE_VARIABLES, smsByteLength, smsKind } from "@/app/lib/auto-message-triggers";
// 미리보기는 발송 서버와 같은 쿠폰 치환 함수를 쓴다(문구가 어긋나지 않게)
import { fillCouponVars, fmtExpiry } from "@/app/lib/crm-auto-coupon-vars";
import type { CouponRow } from "./_coupon-list";
import { EmptyBox, Section, authedFetch, formatYmd, primaryBtn } from "./_shared";

type AudienceKind = "all" | "active" | "dormant" | "expiring" | "expired" | "unassigned" | "individual";

// 메세지 전송 화면과 같은 대상 분류
const AUDIENCE_OPTIONS: { key: AudienceKind; label: string; desc: string }[] = [
  { key: "all", label: "전체 회원", desc: "센터에 등록된 활성 회원 전체" },
  { key: "active", label: "유효 회원", desc: "오늘 기준 활성 수강권 또는 회원권 보유" },
  { key: "dormant", label: "장기 미출석 회원", desc: "유효 회원 중 지정 일수 이상 미출석" },
  { key: "expiring", label: "만료 임박", desc: "지정 일수 이내 만료 예정" },
  { key: "expired", label: "만료 회원", desc: "활성 상품 없음 (과거 이력 있음)" },
  { key: "unassigned", label: "미가입 회원", desc: "수강권/회원권 이력 없음" },
  { key: "individual", label: "개별 선택", desc: "회원을 직접 검색·선택" },
];

/** 안내 문구 변수 — 자동 메세지 변수 + 쿠폰 발송 전용 #쿠폰조건# */
const VAR_DEFS: VarDef[] = [...MESSAGE_VARIABLES, COUPON_CONDITION_VAR];
const varDefOf = (token: string) => VAR_DEFS.find((v) => v.token === token);
/** 쿠폰 발송에서 값이 채워지는 변수 — 나머지(만료일·결제내역 등 알림 사건 값)는 빈칸으로 나간다 */
const ALLOWED_TOKENS = new Set<string>([...COUPON_SEND_MEMBER_TOKENS, ...COUPON_SEND_COUPON_TOKENS]);
const SAMPLE_CODE = "ABCD-1234";

interface MemberOption {
  id: number;
  name: string;
  phone: string | null;
}

export function CouponSendTab({
  centerName,
  smsAllowed,
  initialCouponId,
  onSent,
}: {
  centerName: string;
  smsAllowed: boolean;
  initialCouponId: number | null;
  onSent: () => void;
}) {
  const { getIdToken } = useAuth();
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [couponId, setCouponId] = useState<number | null>(initialCouponId);
  const [audience, setAudience] = useState<AudienceKind>("all");
  const [withinDays, setWithinDays] = useState(7);
  const [inactiveDays, setInactiveDays] = useState(14);
  const [selected, setSelected] = useState<MemberOption[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemberOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  // 받을 회원 명단 + 직원이 뺀 회원
  const [recipients, setRecipients] = useState<{ id: number; name: string; phone: string | null; alreadyHas: boolean }[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [listQuery, setListQuery] = useState("");
  const [push, setPush] = useState(true);
  const [sms, setSms] = useState(false);
  // 안내 문구 — 처음엔 '마지막으로 보낸 문구'(없으면 CRM 기본 안내문구)로 채운다
  const [message, setMessage] = useState("");
  const [messageLoaded, setMessageLoaded] = useState(false);
  const [lastSent, setLastSent] = useState<string | null>(null);
  // '현재 문구 저장'으로 고정한 문구 — 있으면 발송해도 바뀌지 않고 화면을 열 때 항상 이걸 채운다
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [savingMessage, setSavingMessage] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // '기본 입력값' 결과 안내 — 바꿨으면 되돌리기(prev)를 준다. 확인창 대신(크롬 '대화상자 차단' 시 조용히 취소되던 문제)
  const [resetNote, setResetNote] = useState<{ text: string; prev: string | null } | null>(null);
  const [bodyFlash, setBodyFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 센터 실제 값(센터명·전화·주소·운영시간·앱설치링크) — 변수 미리보기용
  const [varSamples, setVarSamples] = useState<Record<string, string>>({});
  const [varHint, setVarHint] = useState<{ token: string; left: number; top: number; above: boolean } | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await authedFetch(getIdToken, "/api/crm/coupons?status=active");
      if (!r.ok) {
        // 권한 없음을 삼키면 쿠폰 드롭다운이 빈 채로 떠 이유를 알 수 없다
        setCoupons([]);
        setLoadError((r.data as { error?: string })?.error || "쿠폰 목록을 볼 권한이 없어요");
        return;
      }
      setLoadError(null);
      const list = ((r.data.coupons as CouponRow[]) ?? []).filter((c) => c.sendable);
      setCoupons(list);
      setCouponId((cur) => cur ?? list[0]?.id ?? null);
    })();
  }, [getIdToken]);

  // 저장한 문구 → 마지막으로 보낸 문구 → 없으면(처음 보내는 센터·조회 실패) CRM 기본 안내문구
  useEffect(() => {
    let alive = true;
    (async () => {
      let saved: string | null = null;
      let last: string | null = null;
      try {
        const r = await authedFetch(getIdToken, "/api/crm/coupons/send");
        if (r.ok) {
          saved = (r.data.saved_message as string | null) ?? null;
          last = (r.data.last_message as string | null) ?? null;
        }
      } catch {
        /* 기본 문구로 */
      }
      if (!alive) return;
      setSavedMessage(saved);
      setLastSent(last);
      // 불러오는 사이 직원이 먼저 입력했으면 덮어쓰지 않는다
      setMessage((cur) => cur || saved || last || defaultCouponMessage());
      setMessageLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [getIdToken]);

  useEffect(() => {
    (async () => {
      try {
        const r = await authedFetch(getIdToken, "/api/crm/auto-messages/var-samples");
        if (r.ok) setVarSamples((r.data.samples as Record<string, string>) ?? {});
      } catch {
        /* 예시값으로 */
      }
    })();
  }, [getIdToken]);

  const coupon = coupons.find((c) => c.id === couponId) ?? null;

  // 받을 회원 명단 — 누가 받는지 보여주고, 거기서 뺄 수 있게 한다
  const refreshCount = useCallback(async () => {
    setListLoading(true);
    try {
      const r = await authedFetch(getIdToken, "/api/crm/coupons/send-preview", {
        method: "POST",
        body: JSON.stringify({
          coupon_id: couponId,
          audience_kind: audience,
          member_ids: selected.map((m) => m.id),
          within_days: withinDays,
          inactive_days: inactiveDays,
        }),
      });
      if (r.ok) {
        const list = (r.data.recipients as typeof recipients) ?? [];
        setRecipients(list);
        setCount(list.length);
        // 조건이 바뀌면 명단에 없는 회원의 제외 표시는 정리한다
        setExcluded((prev) => {
          const ids = new Set(list.map((m) => m.id));
          const next = new Set(Array.from(prev).filter((id) => ids.has(id)));
          return next.size === prev.size ? prev : next;
        });
      } else {
        setRecipients([]);
        setCount(null);
      }
    } catch {
      setRecipients([]);
      setCount(null);
    } finally {
      setListLoading(false);
    }
  }, [getIdToken, couponId, audience, selected, withinDays, inactiveDays]);
  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  // 개별 선택 검색 (디바운스)
  useEffect(() => {
    if (audience !== "individual") return;
    const q = query.trim();
    if (!q) return;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await authedFetch(getIdToken, `/api/crm/members?q=${encodeURIComponent(q)}&limit=30`);
        setResults(r.ok ? ((r.data.members as MemberOption[]) ?? []) : []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, audience, getIdToken]);

  // 실제 발송 대상 = 명단 − 직원이 뺀 사람 (1인 1장 보유자는 서버가 한 번 더 걸러낸다)
  const sendTargets = recipients.filter((m) => !excluded.has(m.id));
  const shownList = listQuery.trim()
    ? recipients.filter((m) => {
        const q = listQuery.trim().toLowerCase();
        return m.name.toLowerCase().includes(q) || (m.phone ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, ""));
      })
    : recipients;

  // ── 안내 문구 변수 ──
  const firstName = sendTargets[0]?.name ?? "";
  const sampleOf = (token: string): string => {
    if (token === "#회원명#" && firstName) return firstName;
    if (varSamples[token]) return varSamples[token];
    if (token === "#센터명#" && centerName) return centerName;
    if (coupon) {
      if (token === "#쿠폰명#") return coupon.name;
      if (token === "#쿠폰혜택#") return benefitText(coupon);
      if (token === "#쿠폰기한#") return fmtExpiry(issueExpiryYmd(coupon));
      if (token === "#쿠폰조건#") return conditionText(coupon) || "(조건 없는 쿠폰 — 이 줄은 빼고 보내요)";
    }
    if (token === "#쿠폰코드#") return SAMPLE_CODE;
    return varDefOf(token)?.sample ?? "";
  };
  const openVarHint = (token: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const W = 300;
    const H = 150; // 말풍선 대략 높이 — 아래로 공간이 없으면 위로 띄운다
    const above = r.bottom + H > window.innerHeight;
    setVarHint({
      token,
      left: Math.max(10, Math.min(r.left, window.innerWidth - W - 10)),
      top: above ? r.top - 8 : r.bottom + 8,
      above,
    });
  };
  const insertVar = (token: string) => {
    const el = bodyRef.current;
    if (!el) {
      setMessage((b) => b + token);
      return;
    }
    const start = el.selectionStart ?? message.length;
    const end = el.selectionEnd ?? message.length;
    setMessage(message.slice(0, start) + token + message.slice(end));
    setResetNote(null);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };
  const resetToDefault = () => {
    const def = defaultCouponMessage();
    const same = message.trim() === def.trim();
    if (!same) setMessage(def);
    // 이미 같은 문구면 글자가 안 바뀌어 눌러도 반응이 없어 보인다 → 칸을 깜빡이고 안내를 띄운다
    setResetNote(
      same
        ? { text: "이미 CRM 기본 안내문구가 들어 있어요", prev: null }
        : { text: "CRM 기본 안내문구로 바꿨어요", prev: message }
    );
    setBodyFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setBodyFlash(false), 900);
    requestAnimationFrame(() => {
      const el = bodyRef.current;
      if (!el) return;
      el.scrollTop = 0;
      el.focus();
      el.setSelectionRange(0, 0);
    });
  };
  const undoReset = () => {
    if (resetNote?.prev == null) return;
    setMessage(resetNote.prev);
    setResetNote(null);
  };
  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);
  // 입력칸 높이 = 문구 길이에 맞춤(최대 560px) — 고정 높이면 앞 몇 줄만 보여 미리보기와 달라 보인다
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight + 2, 220), 560)}px`;
  }, [message]);
  const saveMessage = async () => {
    const text = message.trim();
    if (!text) return alert("저장할 안내 문구를 입력해 주세요");
    setSavingMessage(true);
    const r = await authedFetch(getIdToken, "/api/crm/coupons/send", {
      method: "PUT",
      body: JSON.stringify({ message: text }),
    });
    setSavingMessage(false);
    if (!r.ok) return alert(String(r.data.error ?? "안내 문구를 저장하지 못했어요"));
    setSavedMessage(text);
    setMessage(text);
  };

  // 회원이 받는 메세지 미리보기 — 발송 서버와 같은 순서로 치환(#쿠폰조건# → 쿠폰 변수 → 나머지)
  const previewBody = (() => {
    if (!message.trim() || !coupon) return "";
    let out = fillCouponCondition(message, conditionText(coupon));
    out = fillCouponVars(out, {
      name: coupon.name,
      benefit: benefitText(coupon),
      code: SAMPLE_CODE,
      expires: fmtExpiry(issueExpiryYmd(coupon)),
    });
    for (const v of MESSAGE_VARIABLES) out = out.replaceAll(v.token, ALLOWED_TOKENS.has(v.token) ? sampleOf(v.token) : "");
    return out.trim();
  })();
  const usedTokens = Array.from(new Set(message.match(/#[^#\s]{1,12}#/g) ?? []));
  // 없는 변수(오타) — 치환되지 않고 글자 그대로 나간다
  const unknownVars = usedTokens.filter((t) => !varDefOf(t));
  // 자동 메세지 전용 변수 — 쿠폰 발송엔 값이 없어 빈칸으로 나간다
  const blankVars = usedTokens.filter((t) => varDefOf(t) && !ALLOWED_TOKENS.has(t));
  const isSavedMessage = !!savedMessage && message.trim() === savedMessage;
  const messageHint = !messageLoaded
    ? "불러오는 중…"
    : isSavedMessage
      ? "저장한 문구 — 다음에도 이 문구로 채워져요"
      : message === defaultCouponMessage()
        ? savedMessage
          ? "CRM 기본 안내문구 — 저장해야 다음에도 이 문구로 채워져요"
          : "CRM 기본 안내문구"
        : !savedMessage && lastSent && message.trim() === lastSent
          ? "마지막으로 보낸 문구"
          : savedMessage
            ? "수정한 문구 — '현재 문구 저장'을 눌러야 다음에도 이 문구로 채워져요"
            : "수정한 문구 — 저장하거나 보내면 다음에도 이 문구로 채워져요";

  const channelsLabel = push && sms ? "앱 알림 + 문자" : push ? "앱 알림" : sms ? "문자" : "알림 없이 쿠폰함에만 발급";

  const send = async () => {
    if (!coupon) return;
    if (audience === "individual" && selected.length === 0) return alert("회원을 선택해 주세요");
    const n = sendTargets.length;
    if (n === 0) return alert("보낼 회원이 없어요. 명단에서 한 명 이상 선택해 주세요.");
    if ((push || sms) && !message.trim()) return alert("안내 문구를 입력해 주세요");
    if (!confirm(`'${coupon.name}' 쿠폰을 ${n.toLocaleString()}명에게 발급할까요?\n발송 방법: ${channelsLabel}${sms ? "\n※ 문자는 건당 요금이 발생해요" : ""}`))
      return;
    setSending(true);
    setResult("");
    const channels = [push ? "push" : null, sms ? "sms" : null].filter(Boolean);
    const r = await authedFetch(getIdToken, "/api/crm/coupons/send", {
      method: "POST",
      body: JSON.stringify({
        coupon_id: coupon.id,
        audience_kind: audience,
        member_ids: selected.map((m) => m.id),
        within_days: withinDays,
        inactive_days: inactiveDays,
        channels,
        message: push || sms ? message : "",
        exclude_member_ids: Array.from(excluded),
      }),
    });
    setSending(false);
    if (!r.ok) return setResult(`⚠️ ${String(r.data.error ?? "발송 실패")}`);
    const smsInfo = r.data.sms as { sent: number; failed: number } | null;
    setResult(
      `✅ ${Number(r.data.issued).toLocaleString()}명에게 발급했어요` +
        (Number(r.data.excluded) > 0 ? ` · 명단에서 뺀 ${r.data.excluded}명 제외` : "") +
        (Number(r.data.skipped) > 0 ? ` · 이미 보유한 ${r.data.skipped}명은 건너뜀(1인 1장)` : "") +
        (smsInfo ? ` · 문자 성공 ${smsInfo.sent} / 실패 ${smsInfo.failed}` : "")
    );
    // 방금 보낸 문구 = 다음에 이 화면을 열 때 채워질 문구(저장한 문구가 없을 때만)
    if (push || sms) setLastSent(message.trim());
    setSelected([]);
    setExcluded(new Set());
    onSent();
  };

  if (loadError) {
    return <EmptyBox>{loadError}</EmptyBox>;
  }
  if (coupons.length === 0) {
    return <EmptyBox>발송할 수 있는 쿠폰이 없어요. &lsquo;쿠폰&rsquo; 탭에서 먼저 쿠폰을 만들어 주세요.</EmptyBox>;
  }

  return (
    <div>
      <Section title="1. 보낼 쿠폰">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {coupons.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCouponId(c.id)}
              className={`text-left px-3 py-2.5 rounded-xl border transition-colors ${
                couponId === c.id
                  ? "border-[#6B7B3A] bg-[#6B7B3A]/10 dark:bg-[#6B7B3A]/20"
                  : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 hover:border-[#6B7B3A]/40"
              }`}
            >
              <div className="text-[13px] font-semibold text-[#2A251D] dark:text-zinc-100">{c.name}</div>
              <div className="text-[12.5px] font-bold text-[#4d5a29] dark:text-[#A8B87A]">{benefitText(c)}</div>
              <div className="text-[11.5px] text-[#8C8270] dark:text-zinc-400 mt-0.5">
                {[conditionText(c), c.valid_mode === "until" ? `${formatYmd(c.valid_until)}까지` : `받은 날부터 ${c.valid_days}일`, c.one_per_member ? "1인 1장" : ""]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </button>
          ))}
        </div>
      </Section>

      <Section title="2. 받을 회원">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {AUDIENCE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setAudience(opt.key)}
              className={`text-left px-3 py-2.5 rounded-xl border transition-colors ${
                audience === opt.key
                  ? "border-[#6B7B3A] bg-[#6B7B3A]/10 dark:bg-[#6B7B3A]/20"
                  : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 hover:border-[#6B7B3A]/40"
              }`}
            >
              <div className="text-[13px] font-semibold text-[#2A251D] dark:text-zinc-100">{opt.label}</div>
              <div className="text-[11.5px] text-[#8C8270] dark:text-zinc-400 mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>
        {audience === "expiring" && (
          <div className="mt-3 flex items-center gap-2 text-[13px] text-[#3A342A] dark:text-zinc-200">
            <span>만료</span>
            <input type="number" min={1} max={60} value={withinDays} onChange={(e) => setWithinDays(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} className={`${crmInputClass} !w-20`} />
            <span>일 이내</span>
          </div>
        )}
        {audience === "dormant" && (
          <div className="mt-3 flex items-center gap-2 text-[13px] text-[#3A342A] dark:text-zinc-200">
            <span>최근</span>
            <input type="number" min={1} max={365} value={inactiveDays} onChange={(e) => setInactiveDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))} className={`${crmInputClass} !w-20`} />
            <span>일 이상 미출석</span>
          </div>
        )}
        {audience === "individual" && (
          <div className="mt-3 space-y-2">
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (!e.target.value.trim()) setResults([]);
              }}
              placeholder="이름 또는 연락처 검색"
              className={crmInputClass}
            />
            {query.trim() && !searching && results.length === 0 && (
              <div className="px-3 py-2 text-[12.5px] text-[#8C8270] text-center border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-lg">검색 결과가 없어요.</div>
            )}
            {results.length > 0 && (
              <ul className="rounded-lg border border-[#E8E0D0] dark:border-zinc-700 max-h-40 overflow-y-auto">
                {results
                  .filter((m) => !selected.some((s) => s.id === m.id))
                  .map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected((p) => [...p, m]);
                          setQuery("");
                          setResults([]);
                        }}
                        className="w-full text-left px-3 py-2 border-b border-[#E8E0D0]/60 dark:border-zinc-800 hover:bg-[#FBF7EB] dark:hover:bg-zinc-800"
                      >
                        <span className="text-[13px] font-medium text-[#2A251D] dark:text-zinc-100">{m.name}</span>
                        {m.phone && <span className="ml-2 text-[11.5px] text-[#8C8270]">{formatPhone(m.phone)}</span>}
                      </button>
                    </li>
                  ))}
              </ul>
            )}
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selected.map((m) => (
                  <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-[#6B7B3A]/10 px-2.5 py-1 text-[12px] text-[#4d5a29] dark:text-[#C3D19A]">
                    {m.name}
                    <button type="button" onClick={() => setSelected((p) => p.filter((x) => x.id !== m.id))} className="text-[#8C8270]" aria-label={`${m.name} 빼기`}>
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="mt-3 text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
          대상 <b className="text-[#2A251D] dark:text-zinc-100">{count == null ? "…" : `${count.toLocaleString()}명`}</b>
          {excluded.size > 0 && (
            <span className="ml-1.5">
              · 뺀 회원 {excluded.size}명 → 실제 발송{" "}
              <b className="text-[#4d5a29] dark:text-[#A8B87A]">{sendTargets.length.toLocaleString()}명</b>
            </span>
          )}
          {coupon?.one_per_member && <span className="ml-1.5 text-[#A89B80]">(이미 이 쿠폰을 가진 회원은 발송 때 제외돼요)</span>}
        </div>

        {/* 받을 회원 명단 — 누가 받는지 확인하고, 뺄 사람은 체크를 끈다 */}
        <div className="mt-2 rounded-xl border border-[#E8E0D0] dark:border-zinc-700 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-[#FBF7EB]/70 dark:bg-zinc-900/70 border-b border-[#E8E0D0] dark:border-zinc-800">
            <span className="text-[12.5px] font-semibold text-[#3A342A] dark:text-zinc-200">받을 회원 명단</span>
            <input
              type="text"
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              placeholder="이름·연락처로 찾기"
              className={`${crmInputClass} !w-40 !py-1 ml-1`}
            />
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setExcluded(new Set())}
                disabled={excluded.size === 0}
                className="px-2 py-1 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[11.5px] font-semibold text-[#6B5D47] dark:text-zinc-300 disabled:opacity-40"
              >
                전체 선택
              </button>
              <button
                type="button"
                onClick={() => setExcluded(new Set(recipients.map((m) => m.id)))}
                disabled={recipients.length === 0 || excluded.size === recipients.length}
                className="px-2 py-1 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[11.5px] font-semibold text-[#6B5D47] dark:text-zinc-300 disabled:opacity-40"
              >
                전체 해제
              </button>
            </div>
          </div>

          {listLoading && recipients.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12.5px] text-[#8C8270]">명단 불러오는 중…</div>
          ) : recipients.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12.5px] text-[#8C8270]">조건에 맞는 회원이 없어요.</div>
          ) : (
            <>
              <ul className="max-h-[260px] overflow-y-auto divide-y divide-[#E8E0D0]/70 dark:divide-zinc-800">
                {shownList.map((m) => {
                  const off = excluded.has(m.id);
                  return (
                    <li key={m.id}>
                      <label
                        className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-[#FBF7EB]/60 dark:hover:bg-zinc-800/60 ${
                          off ? "opacity-45" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-[#6B7B3A]"
                          checked={!off}
                          onChange={(e) =>
                            setExcluded((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.delete(m.id);
                              else next.add(m.id);
                              return next;
                            })
                          }
                        />
                        <span className={`text-[13px] text-[#2A251D] dark:text-zinc-100 ${off ? "line-through" : "font-medium"}`}>
                          {m.name}
                        </span>
                        {m.phone && <span className="text-[11.5px] text-[#8C8270]">{formatPhone(m.phone)}</span>}
                        {m.alreadyHas && (
                          <span className="ml-auto shrink-0 rounded-full bg-[#B47B2A]/12 px-2 py-0.5 text-[11px] font-semibold text-[#8a5c1f] dark:text-amber-300">
                            이미 보유 · 발송 제외
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
              {listQuery.trim() && (
                <div className="px-3 py-1.5 text-[11.5px] text-[#8C8270] border-t border-[#E8E0D0]/70 dark:border-zinc-800">
                  검색 결과 {shownList.length.toLocaleString()}명 · 체크 해제는 검색을 지워도 유지돼요
                </div>
              )}
            </>
          )}
        </div>
      </Section>

      <Section title="3. 알림 방법 · 안내 문구">
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-[#6B7B3A]" checked={push} onChange={(e) => setPush(e.target.checked)} />
            <span className="text-[13px] text-[#3A342A] dark:text-zinc-200">앱 알림 <span className="text-[11.5px] text-[#A89B80]">(앱 연결 회원만 받음)</span></span>
          </label>
          <label
            className={`flex items-center gap-2 ${smsAllowed ? "cursor-pointer" : "opacity-60 cursor-not-allowed"}`}
            title={smsAllowed ? undefined : SMS_NOT_READY_MESSAGE}
          >
            <input type="checkbox" className="w-4 h-4 accent-[#6B7B3A]" disabled={!smsAllowed} checked={sms && smsAllowed} onChange={(e) => setSms(e.target.checked)} />
            <span className="text-[13px] text-[#3A342A] dark:text-zinc-200">
              문자{" "}
              {smsAllowed ? (
                <span className="text-[11.5px] text-[#A89B80]">(건당 요금 발생)</span>
              ) : (
                <span className="text-[11.5px] text-[#A89B80]">🔒 {SMS_NOT_READY_MESSAGE}</span>
              )}
            </span>
          </label>
        </div>
        {!push && !sms && (
          <p className="mt-2 text-[12px] text-[#B47B2A]">알림 없이 회원 쿠폰함에만 넣어요. 회원은 직원 안내로 알게 돼요.</p>
        )}
        {(push || sms) && (
          <>
            <div className="mt-3 mb-1.5 flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] font-medium text-[#6B5D47] dark:text-zinc-400">안내 문구</span>
              <span className="text-[11.5px] text-[#A89B80]">({messageHint})</span>
              <button
                type="button"
                onClick={saveMessage}
                disabled={!messageLoaded || savingMessage || !message.trim() || isSavedMessage}
                title="지금 입력한 문구를 저장해요. 다음에 이 화면을 열면 항상 이 문구가 채워져요(보내도 바뀌지 않아요)."
                className="ml-auto px-2.5 py-1 rounded-lg border border-[#6B7B3A] bg-[#6B7B3A] text-white text-[12px] font-semibold hover:bg-[#5A6830] disabled:opacity-40"
              >
                {savingMessage ? "저장 중…" : isSavedMessage ? "저장됨" : "현재 문구 저장"}
              </button>
              <button
                type="button"
                onClick={resetToDefault}
                disabled={!messageLoaded}
                className="px-2.5 py-1 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 disabled:opacity-40"
              >
                기본 입력값
              </button>
            </div>
            <p className="mb-2 text-[11.5px] leading-relaxed text-[#8C8270] dark:text-zinc-400">
              아래 변수 버튼을 누르면 커서 위치에 들어가요. 버튼에 마우스를 올리면 회원이 받는 메세지에 어떻게 보이는지 미리 볼 수 있어요.
              보낼 때 회원마다 실제 값(이름·쿠폰코드 등)으로 바뀝니다.
            </p>
            {/* 변수 버튼 — 자동 메세지 07 '메세지 입력'과 같은 방식 */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {COUPON_SEND_MEMBER_TOKENS.map((token) => (
                <button
                  key={token}
                  type="button"
                  onClick={() => insertVar(token)}
                  onMouseEnter={(e) => openVarHint(token, e.currentTarget)}
                  onMouseLeave={() => setVarHint(null)}
                  onFocus={(e) => openVarHint(token, e.currentTarget)}
                  onBlur={() => setVarHint(null)}
                  className="px-2 py-1 rounded-md text-[11.5px] font-semibold border border-[#E8E0D0] dark:border-zinc-700 text-[#6B7B3A] dark:text-[#A8B87A] bg-white dark:bg-zinc-900 hover:bg-[#6B7B3A]/5"
                >
                  {token}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <span className="text-[11px] text-[#A89B80] dark:text-zinc-500">쿠폰</span>
              {COUPON_SEND_COUPON_TOKENS.map((token) => (
                <button
                  key={token}
                  type="button"
                  onClick={() => insertVar(token)}
                  onMouseEnter={(e) => openVarHint(token, e.currentTarget)}
                  onMouseLeave={() => setVarHint(null)}
                  onFocus={(e) => openVarHint(token, e.currentTarget)}
                  onBlur={() => setVarHint(null)}
                  className="px-2 py-1 rounded-md text-[11.5px] font-semibold border border-[#B47B2A]/40 text-[#B47B2A] dark:text-amber-300 bg-[#F5E4C8]/20 hover:bg-[#F5E4C8]/40"
                >
                  {token}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-3">
              <div>
                <textarea
                  ref={bodyRef}
                  className={`${crmInputClass} min-h-[220px] leading-relaxed resize-none overflow-y-auto transition-shadow ${
                    bodyFlash ? "ring-2 ring-[#6B7B3A]/60" : ""
                  }`}
                  value={message}
                  maxLength={1000}
                  disabled={!messageLoaded}
                  placeholder={messageLoaded ? "회원에게 보낼 안내 문구를 입력하세요. 위 변수를 눌러 넣을 수 있어요." : "불러오는 중…"}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    setResetNote(null);
                  }}
                />
                {resetNote && (
                  <p className="mt-1.5 text-[11.5px] text-[#6B7B3A] dark:text-[#A8B87A]">
                    ✓ {resetNote.text}
                    {resetNote.prev != null && (
                      <button type="button" onClick={undoReset} className="ml-2 underline font-semibold">
                        되돌리기
                      </button>
                    )}
                  </p>
                )}
                {/* 🚨 오타 변수 — 치환되지 않고 글자 그대로 발송된다 */}
                {unknownVars.length > 0 && (
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-[#C0392B] dark:text-red-300">
                    🚨 {unknownVars.join(", ")} 는 없는 변수예요. 치환되지 않고 <strong>글자 그대로 발송</strong>되니 위 버튼의 변수로 바꿔 주세요.
                  </p>
                )}
                {blankVars.length > 0 && (
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-[#B47B2A] dark:text-amber-300">
                    ⚠️ {blankVars.join(", ")} 는 자동 메세지 전용이라 쿠폰 발송에선 <strong>빈칸으로 발송</strong>돼요.
                  </p>
                )}
                <div className="mt-1 text-right text-[11.5px] text-[#8C8270]">{message.length} / 1000자</div>
              </div>
              <div className="rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 overflow-hidden self-start">
                <div className="px-3 py-1.5 border-b border-[#E8E0D0] dark:border-zinc-800 bg-[#F5F0E5]/60 dark:bg-zinc-800/40 flex items-center justify-between gap-2">
                  <span className="text-[11.5px] font-semibold text-[#3A342A] dark:text-zinc-200">회원이 받는 메세지</span>
                  {sms && previewBody && (
                    <span className="text-[10.5px] text-[#8C8270]">
                      문자 {smsByteLength(previewBody)} Byte · {smsKind(previewBody)}
                    </span>
                  )}
                </div>
                <div className="px-3 py-2.5 text-[12.5px] leading-relaxed text-[#3A342A] dark:text-zinc-200 whitespace-pre-wrap break-keep break-words min-h-[64px]">
                  {previewBody || <span className="text-[#A89B80]">메세지 내용이 여기에 표시됩니다.</span>}
                </div>
                <div className="px-3 pb-2.5 text-[10.5px] leading-relaxed text-[#A89B80]">
                  👤 {firstName ? `이름은 받는 회원 중 ${firstName} 님 기준이고, ` : ""}마일리지 등 회원별 값과 쿠폰코드는 예시예요. 실제로는 회원마다 바뀌어요.
                </div>
              </div>
            </div>
          </>
        )}
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={send}
          disabled={sending || !coupon || sendTargets.length === 0}
          className={primaryBtn}
        >
          {sending
            ? "발송 중…"
            : `${sendTargets.length > 0 ? sendTargets.length.toLocaleString() + "명에게 " : ""}쿠폰 발송`}
        </button>
        {result && <span className="text-[12.5px] text-[#4d5a29] dark:text-[#A8B87A]">{result}</span>}
      </div>

      {/* 변수 호버 미리보기 — '내가 쓴 문구' vs '회원이 받는 메세지' */}
      {varHint && (
        <VarHintBubble
          token={varHint.token}
          left={varHint.left}
          top={varHint.top}
          above={varHint.above}
          sample={sampleOf(varHint.token)}
          vars={VAR_DEFS}
        />
      )}
    </div>
  );
}
