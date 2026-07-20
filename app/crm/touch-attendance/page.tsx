"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { formatPhone } from "../_components/crm-labels";

interface MemberLite {
  id: number;
  name: string;
  phone: string | null;
}

type Result =
  | { kind: "success"; name: string; duplicate?: boolean; mileageAwarded?: number }
  | { kind: "error"; message: string };

/**
 * /crm/touch-attendance — 출석번호 입력식 터치 출석 화면 (새 창).
 * 회원이 본인 출석번호를 누르고 '출석하기' → 체크인.
 * 동일 번호가 여러 명이면 이름을 골라 체크인.
 */
export default function TouchAttendancePage() {
  const { getIdToken } = useAuth();
  const [num, setNum] = useState("");
  const [candidates, setCandidates] = useState<MemberLite[] | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [centerName, setCenterName] = useState("");

  // 센터명 로드 (상단 표시용)
  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        const res = await fetch("/api/crm/bootstrap", {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          setCenterName(data.centerName ?? "");
        }
      } catch {
        /* ignore */
      }
    })();
  }, [getIdToken]);

  const reset = useCallback(() => {
    setNum("");
    setCandidates(null);
    setBusy(false);
  }, []);

  // 결과 토스트 자동 사라짐 + 입력 초기화
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => {
      setResult(null);
      reset();
    }, 3500);
    return () => clearTimeout(t);
  }, [result, reset]);

  const press = (d: string) => {
    if (busy || candidates) return;
    setResult(null);
    setNum((v) => (v.length >= 10 ? v : v + d));
  };
  const backspace = () => {
    if (busy || candidates) return;
    setNum((v) => v.slice(0, -1));
  };
  const clearAll = () => {
    if (busy) return;
    setNum("");
    setCandidates(null);
    setResult(null);
  };

  const checkin = async (member: MemberLite) => {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/attendances/check-in", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ member_id: member.id, source: "touch" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ kind: "error", message: data?.error || "출석 실패" });
      } else {
        setResult({
          kind: "success",
          name: data.member?.name ?? member.name,
          duplicate: data.duplicate,
          mileageAwarded: data.mileage_awarded ?? 0,
        });
      }
    } catch (e) {
      setResult({ kind: "error", message: e instanceof Error ? e.message : "네트워크 오류" });
    } finally {
      setBusy(false);
      setCandidates(null);
      setNum("");
    }
  };

  const submit = async () => {
    if (busy || !num.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/attendances/by-number?no=${encodeURIComponent(num.trim())}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ kind: "error", message: data?.error || "조회 실패" });
        setBusy(false);
        return;
      }
      const members: MemberLite[] = data.members ?? [];
      if (members.length === 0) {
        setResult({ kind: "error", message: `출석번호 ${num.trim()} 회원을 찾을 수 없어요.` });
        setBusy(false);
        setNum("");
      } else if (members.length === 1) {
        await checkin(members[0]);
      } else {
        // 동명(같은 번호) 여러 명 → 이름 선택
        setCandidates(members);
        setBusy(false);
      }
    } catch (e) {
      setResult({ kind: "error", message: e instanceof Error ? e.message : "네트워크 오류" });
      setBusy(false);
    }
  };

  return (
    <div
      className="min-h-dvh flex flex-col items-center px-5 pb-8 bg-[#FEFCF7] dark:bg-zinc-950"
      // 루트 레이아웃 body 의 상단 NavBar 여백(56px) 상쇄 → 상단부터 센터명만 표시
      style={{ marginTop: "calc(-1 * (env(safe-area-inset-top, 0px) + 56px))" }}
    >
      {/* 센터명 상단바 */}
      <div
        className="w-full border-b border-[#E8E0D0] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 text-center py-3 mb-6"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        <span className="text-[16px] font-bold text-[#2A251D] dark:text-zinc-100">
          {centerName || " "}
        </span>
      </div>

      <header className="mb-6 text-center">
        <h1 className="text-[26px] md:text-[30px] font-bold text-[#2A251D] dark:text-zinc-100">
          터치 출석
        </h1>
        <p className="mt-1.5 text-[14px] text-[#6B5D47] dark:text-zinc-400">
          출석번호를 누르고 <strong>출석하기</strong>를 눌러 주세요.
        </p>
      </header>

      {/* 결과 토스트 */}
      {result && (
        <div
          className={`mb-5 w-full max-w-[420px] px-5 py-4 rounded-2xl border-2 text-center
            ${result.kind === "success"
              ? result.duplicate
                ? "border-[#B47B2A] bg-amber-50 text-[#B47B2A]"
                : "border-[#6B7B3A] bg-[#6B7B3A]/10 text-[#6B7B3A]"
              : "border-red-300 bg-red-50 text-red-700"
            }`}
        >
          {result.kind === "success" ? (
            <>
              <div className="text-[18px] font-medium">
                {result.duplicate ? "이미 출석했어요" : "출석 완료!"}
              </div>
              <div className="text-[26px] font-bold mt-0.5">{result.name}</div>
              {!result.duplicate && !!result.mileageAwarded && result.mileageAwarded > 0 && (
                <div className="mt-2 inline-block px-3 py-1 rounded-full bg-[#6B7B3A] text-white text-[13px] font-bold">
                  출석 마일리지 +{result.mileageAwarded.toLocaleString()}P
                </div>
              )}
            </>
          ) : (
            <div className="text-[16px] font-semibold">{result.message}</div>
          )}
        </div>
      )}

      {candidates ? (
        /* 동일 번호 여러 명 → 이름 선택 */
        <div className="w-full max-w-[420px]">
          <div className="mb-3 text-center text-[15px] font-semibold text-[#2A251D] dark:text-zinc-100">
            본인 이름을 선택해 주세요
          </div>
          <ul className="space-y-2.5">
            {candidates.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => checkin(m)}
                  disabled={busy}
                  className="w-full px-5 py-4 rounded-2xl border-2 border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-left hover:border-[#6B7B3A] disabled:opacity-50"
                >
                  <div className="text-[19px] font-bold text-[#2A251D] dark:text-zinc-100">{m.name}</div>
                  {m.phone && (
                    <div className="text-[13px] text-[#A89B80] mt-0.5">{maskPhone(m.phone)}</div>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={clearAll}
            className="mt-4 w-full px-4 py-3 rounded-2xl border border-[#E8E0D0] dark:border-zinc-700 text-[15px] font-semibold text-[#6B5D47] dark:text-zinc-300"
          >
            취소
          </button>
        </div>
      ) : (
        /* 숫자 키패드 */
        <div className="w-full max-w-[420px]">
          <div className="mb-4 h-[76px] rounded-2xl border-2 border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 flex items-center justify-center">
            <span className="text-[40px] font-bold tracking-[0.2em] text-[#2A251D] dark:text-zinc-100">
              {num || <span className="text-[#C9BEA6] tracking-normal text-[20px] font-medium">출석번호</span>}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <KeyBtn key={d} onClick={() => press(d)}>{d}</KeyBtn>
            ))}
            <KeyBtn onClick={backspace} variant="muted">←</KeyBtn>
            <KeyBtn onClick={() => press("0")}>0</KeyBtn>
            <KeyBtn onClick={clearAll} variant="muted">지움</KeyBtn>
          </div>

          <button
            onClick={submit}
            disabled={busy || !num.trim()}
            className="mt-3 w-full py-5 rounded-2xl bg-[#6B7B3A] text-white text-[20px] font-bold hover:bg-[#5a6932] disabled:opacity-40"
          >
            {busy ? "처리 중…" : "출석하기"}
          </button>
        </div>
      )}
    </div>
  );
}

function KeyBtn({
  children,
  onClick,
  variant = "num",
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "num" | "muted";
}) {
  return (
    <button
      onClick={onClick}
      className={`h-[68px] rounded-2xl text-[26px] font-bold select-none active:scale-95 transition-transform
        ${variant === "muted"
          ? "bg-[#F1EADB] dark:bg-zinc-800 text-[#6B5D47] dark:text-zinc-300 text-[18px]"
          : "bg-white dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 text-[#2A251D] dark:text-zinc-100 hover:border-[#6B7B3A]"
        }`}
    >
      {children}
    </button>
  );
}

/** 뒷자리만 노출: 010-1234-**** */
function maskPhone(phone: string): string {
  const f = formatPhone(phone);
  const parts = f.split("-");
  if (parts.length === 3) return `${parts[0]}-${parts[1]}-****`;
  return f;
}
