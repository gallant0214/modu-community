"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";

/** UTF-8 바이트 길이 (알리고 90byte 초과 시 LMS) */
function byteLen(s: string): number {
  let n = 0;
  for (const ch of s) n += ch.charCodeAt(0) > 0x7f ? 2 : 1;
  return n;
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

export function SmsSendTab() {
  const { getIdToken } = useAuth();
  const [remain, setRemain] = useState<{ balance: number; point: number } | null>(null);
  const [remainMsg, setRemainMsg] = useState<string>("");
  const [numbersRaw, setNumbersRaw] = useState("");
  const [msg, setMsg] = useState("");
  const [title, setTitle] = useState("");
  const [testmode, setTestmode] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string>("");

  const numbers = parseNumbers(numbersRaw);
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
      if (data?.ok) setRemain({ balance: data.balance, point: data.point });
      else setRemainMsg(data?.message || "잔액을 불러오지 못했어요.");
    } catch {
      setRemainMsg("잔액 조회 중 오류가 발생했어요.");
    }
  }, [getIdToken]);

  useEffect(() => {
    loadRemain();
  }, [loadRemain]);

  const send = async () => {
    if (numbers.length === 0) {
      alert("수신번호를 입력해 주세요.");
      return;
    }
    if (!msg.trim()) {
      alert("내용을 입력해 주세요.");
      return;
    }
    const label = testmode
      ? `[테스트 모드] 실제 발송 없이 검증만 합니다.\n${numbers.length}명 대상, ${msgType}.`
      : `⚠️ 실제 발송됩니다.\n${numbers.length}명에게 ${msgType} 발송(과금).`;
    if (!window.confirm(`${label}\n\n계속할까요?`)) return;

    setSending(true);
    setResult("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/sms/send", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          receivers: numbers,
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
        }
        loadRemain();
      }
    } catch (e) {
      setResult(`❌ ${e instanceof Error ? e.message : "네트워크 오류"}`);
    } finally {
      setSending(false);
    }
  };

  const inputCls =
    "w-full px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[13.5px] text-[#2A251D] dark:text-zinc-100";

  return (
    <div className="max-w-2xl space-y-4">
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

      {/* 수신번호 */}
      <div>
        <label className="block mb-1 text-[13px] font-semibold text-[#3A342A] dark:text-zinc-200">
          수신번호 <span className="text-[#8C8270] font-normal">(쉼표·줄바꿈으로 여러 명, 최대 1,000명)</span>
        </label>
        <textarea
          className={`${inputCls} min-h-[90px] font-mono`}
          value={numbersRaw}
          onChange={(e) => setNumbersRaw(e.target.value)}
          placeholder={"010-1234-5678, 01098765432\n053-755-4455"}
        />
        <div className="mt-1 text-[12px] text-[#8C8270]">
          인식된 수신자: <strong className="text-[#6B7B3A] dark:text-[#A8B87A]">{numbers.length}명</strong>
        </div>
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

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={send}
          disabled={sending || numbers.length === 0 || !msg.trim()}
          className={`px-5 py-2.5 rounded-lg text-[13.5px] font-bold text-white disabled:opacity-50 ${
            testmode ? "bg-[#6B7B3A]" : "bg-[#B4472A]"
          }`}
        >
          {sending ? "발송 중…" : testmode ? "테스트 발송" : "실제 발송"}
        </button>
        {result && <span className="text-[13px] text-[#3A342A] dark:text-zinc-200">{result}</span>}
      </div>

      <p className="text-[11.5px] text-[#A89B80] leading-relaxed">
        발신번호 053-755-4455 · 솔라피(Solapi) 연동 · 90byte 초과 시 자동 LMS 전환.
        광고성 문자는 (광고) 표기·무료수신거부번호 명시가 필요합니다.
      </p>
    </div>
  );
}
