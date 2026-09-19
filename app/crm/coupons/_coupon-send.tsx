"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { crmInputClass } from "../_components/crm-modal";
import { formatPhone } from "../_components/crm-labels";
import {
  benefitText,
  conditionText,
  defaultCouponMessage,
  issueExpiryYmd,
} from "@/app/lib/crm-coupons";
import type { CouponRow } from "./_coupon-list";
import { EmptyBox, FieldLabel, Section, authedFetch, formatYmd, primaryBtn } from "./_shared";

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
  const [push, setPush] = useState(true);
  const [sms, setSms] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTouched, setMessageTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState("");

  useEffect(() => {
    (async () => {
      const r = await authedFetch(getIdToken, "/api/crm/coupons?status=active");
      const list = ((r.data.coupons as CouponRow[]) ?? []).filter((c) => c.sendable);
      setCoupons(list);
      setCouponId((cur) => cur ?? list[0]?.id ?? null);
    })();
  }, [getIdToken]);

  const coupon = coupons.find((c) => c.id === couponId) ?? null;

  // 기본 문구 — 직원이 손대기 전까지는 쿠폰을 바꿀 때마다 새로 채운다
  const defaultMsg = useMemo(
    () =>
      coupon
        ? defaultCouponMessage({
            centerName,
            couponName: coupon.name,
            benefit: benefitText(coupon),
            condition: conditionText(coupon),
            expiresAt: issueExpiryYmd(coupon),
          })
        : "",
    [coupon, centerName]
  );
  const shownMessage = messageTouched ? message : defaultMsg;

  // 대상 인원 미리보기 — 메세지 전송과 같은 집계 API 사용
  const refreshCount = useCallback(async () => {
    try {
      const r = await authedFetch(getIdToken, "/api/crm/messages/preview", {
        method: "POST",
        body: JSON.stringify({
          audience_kind: audience,
          member_ids: selected.map((m) => m.id),
          within_days: withinDays,
          inactive_days: inactiveDays,
        }),
      });
      setCount(r.ok ? Number(r.data.count ?? 0) : null);
    } catch {
      setCount(null);
    }
  }, [getIdToken, audience, selected, withinDays, inactiveDays]);
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

  const channelsLabel = push && sms ? "앱 알림 + 문자" : push ? "앱 알림" : sms ? "문자" : "알림 없이 쿠폰함에만 발급";

  const send = async () => {
    if (!coupon) return;
    if (audience === "individual" && selected.length === 0) return alert("회원을 선택해 주세요");
    const n = count ?? 0;
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
        message: messageTouched ? message : "",
      }),
    });
    setSending(false);
    if (!r.ok) return setResult(`⚠️ ${String(r.data.error ?? "발송 실패")}`);
    const smsInfo = r.data.sms as { sent: number; failed: number } | null;
    setResult(
      `✅ ${Number(r.data.issued).toLocaleString()}명에게 발급했어요` +
        (Number(r.data.skipped) > 0 ? ` · 이미 보유한 ${r.data.skipped}명은 건너뜀(1인 1장)` : "") +
        (smsInfo ? ` · 문자 성공 ${smsInfo.sent} / 실패 ${smsInfo.failed}` : "")
    );
    setSelected([]);
    onSent();
  };

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
          {coupon?.one_per_member && <span className="ml-1.5 text-[#A89B80]">(이미 이 쿠폰을 가진 회원은 발송 때 제외돼요)</span>}
        </div>
      </Section>

      <Section title="3. 알림 방법 · 안내 문구">
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-[#6B7B3A]" checked={push} onChange={(e) => setPush(e.target.checked)} />
            <span className="text-[13px] text-[#3A342A] dark:text-zinc-200">앱 알림 <span className="text-[11.5px] text-[#A89B80]">(앱 연결 회원만 받음)</span></span>
          </label>
          <label className={`flex items-center gap-2 ${smsAllowed ? "cursor-pointer" : "opacity-50 cursor-not-allowed"}`}>
            <input type="checkbox" className="w-4 h-4 accent-[#6B7B3A]" disabled={!smsAllowed} checked={sms && smsAllowed} onChange={(e) => setSms(e.target.checked)} />
            <span className="text-[13px] text-[#3A342A] dark:text-zinc-200">
              문자 {smsAllowed ? <span className="text-[11.5px] text-[#A89B80]">(건당 요금 발생)</span> : "🔒"}
            </span>
          </label>
        </div>
        {!push && !sms && (
          <p className="mt-2 text-[12px] text-[#B47B2A]">알림 없이 회원 쿠폰함에만 넣어요. 회원은 직원 안내로 알게 돼요.</p>
        )}
        {(push || sms) && (
          <>
            <FieldLabel hint={messageTouched ? "" : "(쿠폰 내용으로 자동 작성됨 — 고쳐도 돼요)"}>안내 문구</FieldLabel>
            <textarea
              className={`${crmInputClass} min-h-[132px] leading-relaxed`}
              value={shownMessage}
              maxLength={1000}
              onChange={(e) => {
                setMessage(e.target.value);
                setMessageTouched(true);
              }}
            />
            {messageTouched && (
              <button type="button" className="mt-1 text-[12px] text-[#6B7B3A] underline" onClick={() => setMessageTouched(false)}>
                기본 문구로 되돌리기
              </button>
            )}
          </>
        )}
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={send} disabled={sending || !coupon || !count} className={primaryBtn}>
          {sending ? "발송 중…" : `${count ? count.toLocaleString() + "명에게 " : ""}쿠폰 발송`}
        </button>
        {result && <span className="text-[12.5px] text-[#4d5a29] dark:text-[#A8B87A]">{result}</span>}
      </div>
    </div>
  );
}
