"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { formatPhone } from "../_components/crm-labels";
import FaceAttendance from "./face-attendance";
import FaceEnroll from "./face-enroll";

interface MemberLite {
  id: number;
  name: string;
  phone: string | null;
  birth?: string | null;
  has_face?: boolean;
}

type Result =
  | { kind: "success"; name: string; duplicate?: boolean; mileageAwarded?: number }
  | { kind: "error"; message: string };

/**
 * /crm/touch-attendance — 출석번호 입력식 터치 출석 화면 (새 창).
 * 회원이 본인 출석번호를 누르고 '출석하기' → 체크인.
 * 동일 번호가 여러 명이면 이름을 골라 체크인.
 * 태블릿용 가로형/세로형 레이아웃 전환 지원.
 */
export default function TouchAttendancePage() {
  const { getIdToken } = useAuth();
  const [num, setNum] = useState("");
  const [candidates, setCandidates] = useState<MemberLite[] | null>(null);
  const [enrollTarget, setEnrollTarget] = useState<MemberLite | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [centerName, setCenterName] = useState("");
  const [mode, setMode] = useState<"portrait" | "landscape">("portrait");
  const [recogMode, setRecogMode] = useState<"number" | "face">("number");

  // 가로/세로 레이아웃 기억
  useEffect(() => {
    const saved = localStorage.getItem("crm_touch_orientation");
    if (saved === "landscape" || saved === "portrait") setMode(saved);
  }, []);
  const toggleMode = () => {
    setMode((m) => {
      const next = m === "portrait" ? "landscape" : "portrait";
      localStorage.setItem("crm_touch_orientation", next);
      return next;
    });
  };
  const landscape = mode === "landscape";

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
    setEnrollTarget(null);
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
    if (busy || candidates || enrollTarget) return;
    setResult(null);
    setNum((v) => (v.length >= 10 ? v : v + d));
  };
  const backspace = () => {
    if (busy || candidates || enrollTarget) return;
    setNum((v) => v.slice(0, -1));
  };
  const clearAll = () => {
    if (busy) return;
    setNum("");
    setCandidates(null);
    setEnrollTarget(null);
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
        const m = members[0];
        if (m.has_face) {
          await checkin(m);
        } else {
          // 얼굴 미등록 → 촬영/동의 플로우
          setEnrollTarget(m);
          setBusy(false);
        }
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

  const display = (
    <div className="h-[clamp(66px,11vmin,140px)] rounded-2xl border-2 border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 flex items-center justify-center">
      <span className="text-[clamp(32px,6.5vmin,80px)] font-bold tracking-[0.2em] text-[#2A251D] dark:text-zinc-100">
        {num || <span className="text-[#C9BEA6] tracking-normal text-[clamp(18px,3vmin,34px)] font-medium">출석번호</span>}
      </span>
    </div>
  );
  const keypad = (
    <div className="grid grid-cols-3 gap-[clamp(8px,1.6vmin,20px)]">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
        <KeyBtn key={d} onClick={() => press(d)}>{d}</KeyBtn>
      ))}
      <KeyBtn onClick={backspace} variant="muted">←</KeyBtn>
      <KeyBtn onClick={() => press("0")}>0</KeyBtn>
      <KeyBtn onClick={clearAll} variant="muted">지움</KeyBtn>
    </div>
  );
  const submitBtn = (
    <button
      onClick={submit}
      disabled={busy || !num.trim()}
      className={`w-full rounded-2xl bg-[#6B7B3A] text-white text-[clamp(18px,3.4vmin,38px)] font-bold hover:bg-[#5a6932] disabled:opacity-40 ${
        landscape ? "flex-1 py-[clamp(20px,5vmin,60px)]" : "py-[clamp(16px,2.8vmin,34px)]"
      }`}
    >
      {busy ? "처리 중…" : "출석하기"}
    </button>
  );

  return (
    <div
      className="min-h-dvh flex flex-col items-center px-5 pb-8 bg-[#FEFCF7] dark:bg-zinc-950"
      // 루트 레이아웃 body 의 상단 NavBar 여백(56px) 상쇄 - 상단부터 센터명만 표시
      style={{ marginTop: "calc(-1 * (env(safe-area-inset-top, 0px) + 56px))" }}
    >
      {/* 센터명 상단바 + 가로/세로 전환 */}
      <div
        className="relative w-full border-b border-[#E8E0D0] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 text-center py-3 mb-6"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        <span className="text-[16px] font-bold text-[#2A251D] dark:text-zinc-100">
          {centerName || " "}
        </span>
        <button
          onClick={toggleMode}
          className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12.5px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:border-[#6B7B3A]/50"
          title="가로형 / 세로형 전환"
        >
          <OrientationIcon landscape={landscape} />
          {landscape ? "세로형" : "가로형"}
        </button>
      </div>

      <header className="mb-4 text-center">
        <h1 className="text-[26px] md:text-[30px] font-bold text-[#2A251D] dark:text-zinc-100">
          터치 출석
        </h1>
        <p className="mt-1.5 text-[14px] text-[#6B5D47] dark:text-zinc-400">
          {recogMode === "number"
            ? "출석번호를 누르고 출석하기를 눌러 주세요."
            : "얼굴을 카메라에 비추면 자동으로 출석돼요."}
        </p>
      </header>

      {/* 번호 / 얼굴 인식 방식 전환 */}
      <div className="mb-6 inline-flex rounded-xl border border-[#E8E0D0] dark:border-zinc-700 overflow-hidden bg-white dark:bg-zinc-900">
        {(["number", "face"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRecogMode(r)}
            className={`px-5 py-2.5 text-[14px] font-semibold ${
              recogMode === r
                ? "bg-[#6B7B3A] text-white"
                : "text-[#6B5D47] dark:text-zinc-300"
            }`}
          >
            {r === "number" ? "번호 입력" : "얼굴 인식"}
          </button>
        ))}
      </div>

      {recogMode === "face" ? (
        <FaceAttendance />
      ) : (
        <>
      {/* 결과 토스트 */}
      {result && (
        <div
          className={`mb-5 w-full px-5 py-4 rounded-2xl border-2 text-center ${landscape ? "max-w-[min(96vw,1120px)]" : "max-w-[min(92vw,560px)]"}
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

      {enrollTarget ? (
        /* 얼굴 미등록 단일 회원 → 동의·촬영 */
        <FaceEnroll
          member={enrollTarget}
          onCancel={clearAll}
          onDone={async () => {
            const m = enrollTarget;
            setEnrollTarget(null);
            await checkin(m);
          }}
        />
      ) : candidates ? (
        /* 동일 번호 여러 명 → 이름 선택 */
        <div className={`w-full ${landscape ? "max-w-[min(96vw,900px)]" : "max-w-[min(92vw,560px)]"}`}>
          <div className="mb-3 text-center text-[15px] font-semibold text-[#2A251D] dark:text-zinc-100">
            본인 이름을 선택해 주세요
          </div>
          <ul className={landscape ? "grid grid-cols-2 gap-2.5" : "space-y-2.5"}>
            {candidates.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => checkin(m)}
                  disabled={busy}
                  className="w-full px-5 py-4 rounded-2xl border-2 border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-left hover:border-[#6B7B3A] disabled:opacity-50"
                >
                  <div className="text-[19px] font-bold text-[#2A251D] dark:text-zinc-100">{m.name}</div>
                  <div className="mt-0.5 text-[13px] text-[#A89B80] flex flex-wrap gap-x-2">
                    {m.phone && <span>{maskPhone(m.phone)}</span>}
                    {m.birth && <span>· 생년월일 {m.birth}</span>}
                  </div>
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
      ) : landscape ? (
        /* 가로형: 좌 키패드 / 우 표시·출석하기 */
        <div className="w-full max-w-[min(96vw,1120px)] flex flex-row items-stretch gap-[clamp(16px,4vmin,56px)]">
          <div className="w-[min(46vw,520px)] shrink-0">{keypad}</div>
          <div className="flex-1 flex flex-col justify-center gap-[clamp(12px,2.5vmin,28px)]">
            {display}
            {submitBtn}
          </div>
        </div>
      ) : (
        /* 세로형: 표시 → 키패드 → 출석하기 */
        <div className="w-full max-w-[min(92vw,560px)]">
          <div className="mb-[clamp(12px,2vmin,24px)]">{display}</div>
          {keypad}
          <div className="mt-[clamp(10px,1.8vmin,22px)]">{submitBtn}</div>
        </div>
      )}
        </>
      )}
    </div>
  );
}

function OrientationIcon({ landscape }: { landscape: boolean }) {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      {landscape ? (
        <rect x="3" y="6" width="18" height="12" rx="2" />
      ) : (
        <rect x="6" y="3" width="12" height="18" rx="2" />
      )}
    </svg>
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
      className={`h-[clamp(56px,10vmin,128px)] rounded-2xl text-[clamp(22px,4.2vmin,46px)] font-bold select-none active:scale-95 transition-transform
        ${variant === "muted"
          ? "bg-[#F1EADB] dark:bg-zinc-800 text-[#6B5D47] dark:text-zinc-300 !text-[clamp(15px,2.8vmin,30px)]"
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
