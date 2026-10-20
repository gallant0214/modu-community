"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";

/* 비교육 직급(아르바이트·FC) 전용 간단 대시보드.
   수업·수업료 등 교육 지표는 보여주지 않고, 센터명 + 오늘 출석 현황만 표시한다. */

interface Attendance {
  id: number;
  member_id: number;
  checked_in_at: string;
  member: { name: string } | null;
}

const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const timeStr = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  const ap = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ap} ${h12}:${m}`;
};

export function SimpleDashboard({
  centerName,
  displayName,
}: {
  centerName: string;
  displayName: string | null;
}) {
  const { getIdToken } = useAuth();
  const [list, setList] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch(`/api/crm/attendances?date=${kstToday()}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const d = await res.json();
      if (res.ok) setList((d.attendances ?? []) as Attendance[]);
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  const uniqueMembers = new Set(list.map((a) => a.member_id)).size;
  const todayLabel = (() => {
    const k = new Date(Date.now() + 9 * 3600 * 1000);
    return `${k.getUTCFullYear()}년 ${String(k.getUTCMonth() + 1).padStart(2, "0")}월 ${String(k.getUTCDate()).padStart(2, "0")}일`;
  })();

  return (
    <div className="px-5 md:px-8 pt-2 pb-10 max-w-3xl mx-auto">
      <header className="mb-5 rounded-2xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 px-4 py-4 md:px-5 md:py-5 shadow-sm">
        <p className="text-[12px] font-semibold text-[#7F6F55] dark:text-zinc-500">{centerName || "CRM"}</p>
        <h1 className="mt-1 text-[24px] md:text-[28px] leading-tight font-bold text-[#241F18] dark:text-zinc-100">
          대시보드
        </h1>
        <p className="mt-1.5 text-[13px] text-[#6B5D47] dark:text-zinc-400">
          {displayName ? <strong className="text-[#2A251D] dark:text-zinc-100">{displayName}</strong> : null}
          {displayName ? "님, " : ""}오늘도 좋은 하루 되세요 · {todayLabel}
        </p>
      </header>

      <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 md:p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14.5px] font-bold text-[#241F18] dark:text-zinc-100">오늘 출석 현황</h2>
          <span className="text-[12px] font-semibold text-[#8C8270] dark:text-zinc-500">
            {loading ? "불러오는 중…" : `${list.length}건 · ${uniqueMembers}명`}
          </span>
        </div>

        {!loading && list.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-[#A89B80]">아직 오늘 출석한 회원이 없어요.</div>
        ) : (
          <ul className="divide-y divide-[#EFE7D5] dark:divide-zinc-800">
            {list.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2.5">
                <span className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">
                  {a.member?.name ?? "비회원"}
                </span>
                <span className="text-[12.5px] text-[#8C8270] dark:text-zinc-500">{timeStr(a.checked_in_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
