"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { formatPhone } from "../_components/crm-labels";

interface Attendance {
  id: number;
  member_id: number;
  checked_in_at: string;
  source: string;
  member: { id: number; name: string; phone: string | null } | null;
}

type Toast =
  | { kind: "success"; name: string; phone: string | null; at: string; duplicate?: boolean }
  | { kind: "error"; message: string };

/**
 * /crm/kiosk — 카운터에 두는 출석 체크인 키오스크 화면.
 * QR 스캐너 또는 직접 토큰 입력으로 회원 체크인.
 */
export default function CrmKioskPage() {
  const { getIdToken } = useAuth();
  const [token, setToken] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<
    { id: number; name: string; phone: string | null }[]
  >([]);
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const [recent, setRecent] = useState<Attendance[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const idToken = await getIdToken();
    if (!idToken) return;
    const res = await fetch(`/api/crm/attendances?date=${today}`, {
      headers: { authorization: `Bearer ${idToken}` },
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      setRecent(data.attendances ?? []);
    }
  }, [getIdToken, today]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  // 자동 포커스
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const checkin = async (params: { token?: string; member_id?: number; source?: string }) => {
    if (submitting) return;
    setSubmitting(true);
    setToast(null);
    try {
      const idToken = await getIdToken();
      const res = await fetch("/api/crm/attendances/check-in", {
        method: "POST",
        headers: { authorization: `Bearer ${idToken}`, "content-type": "application/json" },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ kind: "error", message: data?.error || "실패" });
      } else {
        setToast({
          kind: "success",
          name: data.member?.name ?? "회원",
          phone: data.member?.phone ?? null,
          at: data.attendance?.checked_in_at ?? "",
          duplicate: data.duplicate,
        });
        await load();
      }
    } catch (e) {
      setToast({
        kind: "error",
        message: e instanceof Error ? e.message : "네트워크 오류",
      });
    } finally {
      setSubmitting(false);
      setToken("");
      setMemberQuery("");
      setMemberResults([]);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  // 토스트 자동 사라짐
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const searchMember = async () => {
    const q = memberQuery.trim();
    if (!q) return;
    const idToken = await getIdToken();
    const res = await fetch(`/api/crm/members?q=${encodeURIComponent(q)}`, {
      headers: { authorization: `Bearer ${idToken}` },
    });
    if (res.ok) {
      const data = await res.json();
      setMemberResults(data.members ?? []);
    }
  };

  return (
    <div className="px-5 md:px-8 py-6 md:py-8 max-w-5xl mx-auto">
      <header className="mb-6 text-center">
        <h1 className="text-[22px] md:text-[26px] font-bold text-[#2A251D] dark:text-zinc-100">
          출석 체크
        </h1>
        <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
          회원이 QR을 스캔하거나 검색하여 입장하세요.
        </p>
      </header>

      {/* 토스트 */}
      {toast && (
        <div
          className={`mb-5 px-5 py-4 rounded-2xl border-2 text-center text-[16px] font-semibold
            ${toast.kind === "success"
              ? toast.duplicate
                ? "border-[#B47B2A] bg-amber-50 text-[#B47B2A]"
                : "border-[#6B7B3A] bg-[#6B7B3A]/10 text-[#6B7B3A]"
              : "border-red-300 bg-red-50 text-red-700"
            }`}
        >
          {toast.kind === "success" ? (
            <>
              <div className="text-[20px] mb-1">{toast.duplicate ? "이미 체크인되었어요" : "환영합니다!"}</div>
              <div className="text-[24px] font-bold">{toast.name}</div>
              {toast.phone && (
                <div className="text-[13px] text-[#6B5D47] font-normal mt-1">
                  {formatPhone(toast.phone)}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-[18px]">{toast.message}</div>
              <div className="mt-1 text-[12.5px] font-normal text-red-700/80">
                회원에게 등록 여부를 확인해 주세요.
              </div>
            </>
          )}
        </div>
      )}

      {/* QR / 토큰 입력 */}
      <section className="mb-5 px-5 py-5 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
        <h2 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-2">
          QR 코드 / 체크인 코드
        </h2>
        <p className="text-[12.5px] text-[#6B5D47] mb-3">
          회원 모바일 앱의 QR을 스캐너에 비추거나, 코드를 직접 입력하세요.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (token.trim()) checkin({ token: token.trim(), source: "kiosk" });
          }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            className="flex-1 px-4 py-3 rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[16px] text-[#2A251D] dark:text-zinc-100 placeholder:text-[#A89B80] focus:outline-none focus:border-[#6B7B3A]"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="QR 스캐너 입력 또는 코드 직접 입력"
            autoFocus
            disabled={submitting}
          />
          <button
            type="submit"
            disabled={submitting || !token.trim()}
            className="px-6 rounded-xl bg-[#6B7B3A] disabled:opacity-50 text-white text-[14.5px] font-semibold hover:bg-[#5a6932]"
          >
            체크인
          </button>
        </form>
      </section>

      {/* 회원 검색 */}
      <section className="mb-5 px-5 py-5 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
        <h2 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-2">
          또는 회원 검색
        </h2>
        <div className="flex gap-2">
          <input
            className="flex-1 px-3 py-2.5 rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[14px]"
            value={memberQuery}
            onChange={(e) => setMemberQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                searchMember();
              }
            }}
            placeholder="이름 또는 연락처"
          />
          <button
            onClick={searchMember}
            className="px-4 rounded-xl bg-[#6B5D47] text-white text-[13.5px] font-semibold"
          >
            검색
          </button>
        </div>
        {memberResults.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {memberResults.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => checkin({ member_id: m.id, source: "manual" })}
                  disabled={submitting}
                  className="w-full text-left px-3 py-2.5 rounded-xl border border-[#E8E0D0] hover:border-[#6B7B3A]/40"
                >
                  <div className="font-semibold text-[#2A251D] dark:text-zinc-100">{m.name}</div>
                  {m.phone && (
                    <div className="text-[12px] text-[#A89B80]">{formatPhone(m.phone)}</div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 오늘 출석 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
            오늘 출석 ({recent.length}명)
          </h2>
          <span className="text-[11.5px] text-[#A89B80]">{today}</span>
        </div>
        {recent.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
            오늘 출석 기록이 없습니다.
          </div>
        ) : (
          <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {recent.map((a) => (
              <li
                key={a.id}
                className="px-3 py-2 rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900"
              >
                <div className="font-semibold text-[#2A251D] dark:text-zinc-100">
                  {a.member?.name ?? "—"}
                </div>
                <div className="text-[11.5px] text-[#8C8270]">
                  {formatTimeKST(a.checked_in_at)}{" "}
                  <span className="ml-1 text-[#A89B80]">· {a.source === "kiosk" ? "QR" : a.source === "manual" ? "검색" : "앱"}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function formatTimeKST(iso: string) {
  try {
    const d = new Date(iso);
    const k = new Date(d.getTime() + 9 * 3600 * 1000);
    return `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}
