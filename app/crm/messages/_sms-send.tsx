"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";

/** UTF-8 바이트 길이 (알리고 90byte 초과 시 LMS) */
function byteLen(s: string): number {
  let n = 0;
  for (const ch of s) n += ch.charCodeAt(0) > 0x7f ? 2 : 1;
  return n;
}

// 무료수신거부 번호 (실제 080 수신거부 번호로 교체 필요)
const OPTOUT_NUMBER = "080-000-0000";

function formatPhone(raw: string): string {
  const d = (raw ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("02")) {
    if (d.length === 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
    if (d.length === 10) return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`;
  }
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  return d;
}

function onlyDigits(s: string): string {
  return (s ?? "").replace(/\D/g, "");
}

function parseNumbers(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,;]+/)
        .map((x) => x.replace(/\D/g, ""))
        .filter((x) => x.length >= 9 && x.length <= 11)
    )
  );
}

interface Recipient {
  id?: number; // 회원에서 선택한 경우
  name?: string;
  phone: string; // 숫자만
}

const SEGMENTS: { key: string; label: string }[] = [
  { key: "active", label: "활성 회원 전체" },
  { key: "expiring", label: "만료 임박" },
  { key: "expired", label: "만료 회원" },
  { key: "locker_expired", label: "락커 만료 회원" },
];

export function SmsSendTab() {
  const { getIdToken } = useAuth();
  const [remain, setRemain] = useState<{ balance: number; point: number } | null>(null);
  const [sender, setSender] = useState<string>("");
  const [remainMsg, setRemainMsg] = useState<string>("");
  const [numbersRaw, setNumbersRaw] = useState("");
  const [msg, setMsg] = useState("");
  const [title, setTitle] = useState("");
  const [testmode, setTestmode] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string>("");

  // 회원 선택 수신자
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<{ id: number; name: string; phone: string | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const [segBusy, setSegBusy] = useState<string | null>(null);

  // 회원 선택 + 직접 입력을 합쳐 최종 수신번호(숫자만, 중복 제거)
  const directNumbers = useMemo(() => parseNumbers(numbersRaw), [numbersRaw]);
  const allNumbers = useMemo(() => {
    const set = new Set<string>();
    for (const r of recipients) if (r.phone) set.add(r.phone);
    for (const n of directNumbers) set.add(n);
    return Array.from(set);
  }, [recipients, directNumbers]);

  const bytes = byteLen(msg);
  const msgType = bytes <= 90 ? "SMS" : "LMS";

  const loadRemain = useCallback(async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/crm/sms/remain", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (data?.configured === false) {
        setRemainMsg("문자 발송 설정(API 키)이 아직 등록되지 않았어요.");
        return;
      }
      if (data?.sender) setSender(data.sender);
      if (data?.ok) setRemain({ balance: data.balance, point: data.point });
      else setRemainMsg(data?.message || "잔액을 불러오지 못했어요.");
    } catch {
      setRemainMsg("잔액 조회 중 오류가 발생했어요.");
    }
  }, [getIdToken]);

  useEffect(() => {
    loadRemain();
  }, [loadRemain]);

  // 회원 검색 (이름/연락처, 디바운스 300ms)
  const searchMembers = useCallback(
    async (q: string) => {
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
    [getIdToken]
  );
  useEffect(() => {
    const q = memberQuery.trim();
    if (!q) {
      setMemberResults([]);
      return;
    }
    const t = setTimeout(() => searchMembers(q), 300);
    return () => clearTimeout(t);
  }, [memberQuery, searchMembers]);

  const addRecipient = (r: Recipient) => {
    const phone = onlyDigits(r.phone);
    if (phone.length < 9) return;
    setRecipients((prev) => (prev.some((x) => x.phone === phone) ? prev : [...prev, { ...r, phone }]));
  };
  const removeRecipient = (phone: string) =>
    setRecipients((prev) => prev.filter((r) => r.phone !== phone));
  const clearRecipients = () => setRecipients([]);

  // 세그먼트 일괄 선택
  const addSegment = async (segment: string) => {
    setSegBusy(segment);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/sms/recipients?segment=${segment}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data?.error || "대상을 불러오지 못했어요.");
        return;
      }
      const members: { id: number; name: string; phone: string }[] = data.members ?? [];
      if (members.length === 0) {
        alert("해당 조건의 연락처 보유 회원이 없어요.");
        return;
      }
      setRecipients((prev) => {
        const map = new Map(prev.map((r) => [r.phone, r]));
        for (const m of members) {
          const phone = onlyDigits(m.phone);
          if (phone.length >= 9 && !map.has(phone)) map.set(phone, { id: m.id, name: m.name, phone });
        }
        return Array.from(map.values());
      });
    } catch {
      alert("대상 조회 중 오류가 발생했어요.");
    } finally {
      setSegBusy(null);
    }
  };

  const send = async () => {
    if (allNumbers.length === 0) {
      alert("수신번호를 선택하거나 입력해 주세요.");
      return;
    }
    if (!msg.trim()) {
      alert("내용을 입력해 주세요.");
      return;
    }
    const label = testmode
      ? `[테스트 모드] 실제 발송 없이 검증만 합니다.\n${allNumbers.length}명 대상, ${msgType}.`
      : `⚠️ 실제 발송됩니다.\n${allNumbers.length}명에게 ${msgType} 발송(과금).`;
    if (!window.confirm(`${label}\n\n계속할까요?`)) return;

    setSending(true);
    setResult("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/sms/send", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          receivers: allNumbers,
          msg,
          title: msgType === "LMS" ? title || undefined : undefined,
          testmode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult(`❌ ${data?.error || "발송 실패"}`);
      } else {
        setResult(
          `${data.testmode ? "🧪 테스트 성공" : "✅ 발송 완료"} · ${data.msg_type} · 성공 ${data.success_cnt}건${
            data.error_cnt ? ` · 실패 ${data.error_cnt}건` : ""
          }`
        );
        if (!data.testmode) {
          setNumbersRaw("");
          setMsg("");
          setTitle("");
          setRecipients([]);
        }
        loadRemain();
      }
    } catch (e) {
      setResult(`❌ ${e instanceof Error ? e.message : "네트워크 오류"}`);
    } finally {
      setSending(false);
    }
  };

  // 무료수신거부 문구를 내용 맨 아래에 자동 추가(중복 방지). 별도 080 번호 미설정 → 발신번호 사용.
  const appendOptout = () => {
    const optout = formatPhone(sender) || "발신번호로 문의";
    setMsg((prev) => {
      if (prev.includes("무료수신거부")) return prev;
      const base = prev.replace(/\s+$/, "");
      return base ? `${base}\n무료수신거부 ${optout}` : `무료수신거부 ${optout}`;
    });
  };

  const inputCls =
    "w-full px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[13.5px] text-[#2A251D] dark:text-zinc-100";

  return (
    <div className="max-w-2xl space-y-4">
      {/* 발신번호 */}
      <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <span className="text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-300">발신번호</span>
        <span className="text-[14px] font-bold text-[#3A342A] dark:text-zinc-100">
          {sender ? formatPhone(sender) : "—"}
        </span>
      </div>

      {/* 잔액 */}
      <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FBF7EB]/60 dark:bg-zinc-900/40">
        <span className="text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-300">발송 잔액</span>
        {remain ? (
          <span className="text-[13px] text-[#3A342A] dark:text-zinc-200">
            캐시 <strong>{remain.balance.toLocaleString()}원</strong> · 포인트{" "}
            <strong>{remain.point.toLocaleString()}P</strong>
          </span>
        ) : (
          <span className="text-[12px] text-[#A89B80]">{remainMsg || "불러오는 중…"}</span>
        )}
      </div>

      {/* 수신자 선택 (회원) */}
      <div className="px-4 py-3.5 rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 space-y-3">
        <div className="text-[13px] font-semibold text-[#3A342A] dark:text-zinc-200">수신자 선택</div>

        {/* 세그먼트 일괄 선택 */}
        <div className="flex flex-wrap gap-1.5">
          {SEGMENTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => addSegment(s.key)}
              disabled={segBusy !== null}
              className="px-3 py-1.5 rounded-lg border border-[#6B7B3A]/50 text-[12.5px] font-semibold text-[#6B7B3A] dark:text-[#A8B87A] hover:bg-[#6B7B3A]/8 disabled:opacity-50"
            >
              {segBusy === s.key ? "불러오는 중…" : `+ ${s.label}`}
            </button>
          ))}
        </div>

        {/* 회원 검색 */}
        <div>
          <input
            type="text"
            value={memberQuery}
            onChange={(e) => setMemberQuery(e.target.value)}
            placeholder="회원 이름 또는 연락처 검색"
            className={inputCls}
          />
          {memberQuery.trim() && !searching && memberResults.length === 0 && (
            <div className="mt-1.5 px-3 py-2 text-[12.5px] text-[#8C8270] text-center border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-lg">
              검색 결과가 없어요.
            </div>
          )}
          {memberResults.length > 0 && (
            <ul className="mt-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 max-h-44 overflow-y-auto">
              {memberResults
                .filter((m) => (m.phone ?? "").replace(/\D/g, "").length >= 9)
                .filter((m) => !recipients.some((r) => r.phone === onlyDigits(m.phone ?? "")))
                .map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => {
                        addRecipient({ id: m.id, name: m.name, phone: m.phone ?? "" });
                        setMemberQuery("");
                        setMemberResults([]);
                      }}
                      className="w-full text-left px-3 py-2 border-b border-[#E8E0D0]/60 dark:border-zinc-800 hover:bg-[#FBF7EB] dark:hover:bg-zinc-800"
                    >
                      <span className="text-[13px] font-medium text-[#2A251D] dark:text-zinc-100">{m.name}</span>
                      {m.phone && (
                        <span className="ml-2 text-[11.5px] text-[#8C8270]">{formatPhone(m.phone)}</span>
                      )}
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>

        {/* 선택된 수신자 칩 */}
        {recipients.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12px] text-[#6B5D47] dark:text-zinc-400">
                선택 <strong className="text-[#6B7B3A] dark:text-[#A8B87A]">{recipients.length}명</strong>
              </span>
              <button
                type="button"
                onClick={clearRecipients}
                className="text-[11.5px] text-[#B4472A] hover:underline"
              >
                전체 지우기
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
              {recipients.map((r) => (
                <span
                  key={r.phone}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] bg-[#6B7B3A]/10 text-[#6B7B3A] dark:bg-[#6B7B3A]/25 dark:text-[#A8B87A] border border-[#6B7B3A]/30"
                >
                  {r.name || formatPhone(r.phone)}
                  <button type="button" onClick={() => removeRecipient(r.phone)} className="ml-0.5 hover:text-red-600">
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 수신번호 직접 입력 */}
      <div>
        <label className="block mb-1 text-[13px] font-semibold text-[#3A342A] dark:text-zinc-200">
          수신번호 직접 입력{" "}
          <span className="text-[#8C8270] font-normal">(쉼표·줄바꿈으로 여러 명, 선택사항)</span>
        </label>
        <textarea
          className={`${inputCls} min-h-[70px] font-mono`}
          value={numbersRaw}
          onChange={(e) => setNumbersRaw(e.target.value)}
          placeholder={"010-1234-5678, 01098765432\n053-755-4455"}
        />
      </div>

      {/* 최종 수신자 수 */}
      <div className="px-3 py-2 rounded-lg bg-[#FBF7EB] dark:bg-zinc-900/60 text-[12.5px] text-[#3A342A] dark:text-zinc-300">
        최종 수신자:{" "}
        <strong className="text-[#6B7B3A] dark:text-[#A8B87A]">{allNumbers.length}명</strong>
        <span className="ml-2 text-[#8C8270]">
          (회원 선택 {recipients.length} · 직접 입력 {directNumbers.length}, 중복 제외)
        </span>
      </div>

      {/* 장문 제목 (LMS 전용) */}
      {msgType === "LMS" && (
        <div>
          <label className="block mb-1 text-[13px] font-semibold text-[#3A342A] dark:text-zinc-200">
            제목 <span className="text-[#8C8270] font-normal">(장문 LMS 전용, 선택)</span>
          </label>
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} />
        </div>
      )}

      {/* 내용 */}
      <div>
        <label className="mb-1 flex items-center justify-between text-[13px] font-semibold text-[#3A342A] dark:text-zinc-200">
          <span>내용</span>
          <span className="text-[12px] font-normal text-[#8C8270]">
            {bytes} byte ·{" "}
            <strong className={msgType === "LMS" ? "text-[#B47B2A]" : "text-[#6B7B3A]"}>{msgType}</strong>
            {msgType === "SMS" ? " (90byte↓)" : " (90byte↑)"}
          </span>
        </label>
        <textarea
          className={`${inputCls} min-h-[140px]`}
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="보낼 문자 내용을 입력하세요."
        />
        <div className="mt-1.5 flex justify-end">
          <button
            type="button"
            onClick={appendOptout}
            className="px-2.5 py-1 rounded-lg text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-300 bg-[#F0EAD9] dark:bg-zinc-800 hover:bg-[#E8E0D0]"
          >
            + 무료수신거부 문구
          </button>
        </div>
      </div>

      {/* 테스트 모드 */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={testmode}
          onChange={(e) => setTestmode(e.target.checked)}
          className="w-4 h-4 accent-[#6B7B3A]"
        />
        <span className="text-[13px] text-[#6B5D47] dark:text-zinc-300">
          테스트 모드 <span className="text-[#8C8270]">(체크 시 실제 발송·과금 없이 검증만)</span>
        </span>
      </label>

      <p className="text-[11.5px] text-[#A89B80] leading-relaxed">
        90byte 초과 시 자동 LMS 전환. 광고성 문자는 (광고) 표기·무료수신거부번호 명시가 필요합니다.
      </p>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={send}
          disabled={sending || allNumbers.length === 0 || !msg.trim()}
          className={`px-5 py-2.5 rounded-lg text-[13.5px] font-bold text-white disabled:opacity-50 ${
            testmode ? "bg-[#6B7B3A]" : "bg-[#B4472A]"
          }`}
        >
          {sending ? "발송 중…" : testmode ? "테스트 발송" : "실제 발송"}
        </button>
        {result && <span className="text-[13px] text-[#3A342A] dark:text-zinc-200">{result}</span>}
      </div>
    </div>
  );
}
