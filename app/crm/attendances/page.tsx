"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { formatPhone } from "../_components/crm-labels";
import { crmInputClass } from "../_components/crm-modal";

interface Attendance {
  id: number;
  member_id: number;
  checked_in_at: string;
  source: string;
  member: { id: number; name: string; phone: string | null } | null;
}

const SOURCE_LABEL: Record<string, string> = {
  kiosk: "QR",
  manual: "검색",
  app: "앱",
};

const SOURCE_STYLE: Record<string, string> = {
  kiosk: "bg-[#6B7B3A]/10 text-[#6B7B3A] dark:bg-[#6B7B3A]/30 dark:text-[#A8B87A]",
  manual: "bg-[#B47B2A]/10 text-[#B47B2A] dark:bg-amber-900/40 dark:text-amber-300",
  app: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
};

/**
 * /crm/attendances — 출석 현황 조회 화면.
 * 날짜별 출석 리스트 + 시간대별 분포 + 소스별 합계 + 회원 검색.
 */
export default function CrmAttendancesPage() {
  const { getIdToken } = useAuth();
  const [date, setDate] = useState(() => todayKst());
  const [rows, setRows] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "kiosk" | "manual" | "app">("all");
  const [refreshedAt, setRefreshedAt] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없어요");
      const res = await fetch(`/api/crm/attendances?date=${date}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setRows(data.attendances ?? []);
      setRefreshedAt(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, date]);

  useEffect(() => {
    load();
  }, [load]);

  // 오늘 날짜인 경우 20초마다 자동 새로고침
  useEffect(() => {
    if (date !== todayKst()) return;
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [date, load]);

  const filtered = useMemo(() => {
    let arr = rows;
    if (sourceFilter !== "all") arr = arr.filter((a) => a.source === sourceFilter);
    const q = query.trim();
    if (q) {
      arr = arr.filter(
        (a) =>
          (a.member?.name ?? "").includes(q) ||
          (a.member?.phone ?? "").includes(q)
      );
    }
    return arr;
  }, [rows, sourceFilter, query]);

  const stats = useMemo(() => {
    const uniqueMembers = new Set(rows.map((a) => a.member_id));
    const sources = { kiosk: 0, manual: 0, app: 0 };
    for (const a of rows) {
      const k = (a.source as keyof typeof sources) ?? "kiosk";
      sources[k] = (sources[k] ?? 0) + 1;
    }
    return {
      total: rows.length,
      unique: uniqueMembers.size,
      sources,
    };
  }, [rows]);

  // 시간대별 분포 (0~23시)
  const hourly = useMemo(() => {
    const buckets = Array.from({ length: 24 }, () => 0);
    for (const a of rows) {
      const d = new Date(a.checked_in_at);
      const kst = new Date(d.getTime() + 9 * 3600 * 1000);
      const h = kst.getUTCHours();
      buckets[h] += 1;
    }
    return buckets;
  }, [rows]);

  const maxHourly = Math.max(1, ...hourly);
  const isToday = date === todayKst();

  const shift = (delta: number) => {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + delta);
    setDate(d.toISOString().slice(0, 10));
  };

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-6xl mx-auto">
      <header className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
            출석 현황
          </h1>
          <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
            날짜별 회원 출석 기록을 확인해요. 오늘은 20초마다 자동 갱신됩니다.
          </p>
        </div>
        {refreshedAt && (
          <div className="text-[11px] text-[#A89B80] dark:text-zinc-500 self-end">
            최근 갱신 {formatTimeKST(refreshedAt)}
          </div>
        )}
      </header>

      {/* 날짜 이동 */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <button
          onClick={() => shift(-1)}
          className="px-3 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13px] text-[#3A342A] dark:text-zinc-200 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800/60"
        >
          ← 이전
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={`${crmInputClass} !w-auto`}
        />
        <button
          onClick={() => shift(1)}
          disabled={date >= todayKst()}
          className="px-3 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13px] text-[#3A342A] dark:text-zinc-200 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800/60 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          다음 →
        </button>
        <button
          onClick={() => setDate(todayKst())}
          disabled={isToday}
          className="px-3 py-1.5 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold disabled:opacity-40 hover:bg-[#5a6932]"
        >
          오늘
        </button>
        <button
          onClick={load}
          disabled={loading}
          className="ml-auto px-3 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13px] text-[#6B5D47] hover:bg-[#F5F0E5] disabled:opacity-50"
        >
          {loading ? "새로고침 중…" : "새로고침"}
        </button>
      </div>

      {/* KPI 4개 */}
      <div className="mb-5 grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <KpiCard label="총 출석" value={`${stats.total}회`} />
        <KpiCard label="출석 회원" value={`${stats.unique}명`} />
        <KpiCard label="QR 체크인" value={`${stats.sources.kiosk}회`} tone="olive" />
        <KpiCard label="수동/앱" value={`${stats.sources.manual + stats.sources.app}회`} tone="amber" />
      </div>

      {/* 시간대별 분포 */}
      <section className="mb-5 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4">
        <h2 className="text-[13.5px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-3">
          시간대별 분포 (KST)
        </h2>
        {rows.length === 0 ? (
          <div className="py-6 text-center text-[12.5px] text-[#8C8270]">
            데이터가 없어요.
          </div>
        ) : (
          <div className="flex items-end gap-1 h-24">
            {hourly.map((count, h) => {
              const ratio = count / maxHourly;
              return (
                <div key={h} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div className="w-full flex items-end justify-center h-full">
                    <div
                      className={`w-full rounded-t ${count === 0 ? "bg-[#F5F0E5] dark:bg-zinc-800" : "bg-[#6B7B3A]"}`}
                      style={{ height: `${Math.max(2, ratio * 100)}%` }}
                      title={`${h}시 ${count}건`}
                    />
                  </div>
                  <div className="text-[9px] text-[#A89B80] dark:text-zinc-500 leading-none">
                    {h % 3 === 0 ? `${h}` : ""}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 필터 */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        {(["all", "kiosk", "manual", "app"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSourceFilter(s)}
            className={`px-2.5 py-1 rounded-full text-[12px] font-semibold border transition-colors
              ${sourceFilter === s
                ? "bg-[#6B7B3A] text-white border-[#6B7B3A]"
                : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300 hover:border-[#6B7B3A]/40"
              }`}
          >
            {s === "all"
              ? `전체 ${stats.total}`
              : `${SOURCE_LABEL[s]} ${stats.sources[s as "kiosk" | "manual" | "app"] ?? 0}`}
          </button>
        ))}
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름 또는 연락처 검색"
          className={`${crmInputClass} ml-auto`}
          style={{ maxWidth: 260 }}
        />
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* 리스트 */}
      {loading && rows.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
          {rows.length === 0
            ? "이 날짜에는 출석 기록이 없어요."
            : "조건에 맞는 기록이 없어요."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#E8E0D0] dark:border-zinc-800">
          <table className="w-full text-[13px]">
            <thead className="bg-[#FBF7EB] dark:bg-zinc-900/80 text-[#6B5D47] dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 text-left font-medium">시간</th>
                <th className="px-3 py-2 text-left font-medium">회원</th>
                <th className="px-3 py-2 text-left font-medium">연락처</th>
                <th className="px-3 py-2 text-left font-medium">경로</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr
                  key={a.id}
                  className="border-t border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900"
                >
                  <td className="px-3 py-2.5 text-[#2A251D] dark:text-zinc-100 font-semibold">
                    {formatTimeKST(a.checked_in_at)}
                  </td>
                  <td className="px-3 py-2.5 text-[#3A342A] dark:text-zinc-200">
                    {a.member?.name ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-[#8C8270] dark:text-zinc-500">
                    {a.member?.phone ? formatPhone(a.member.phone) : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${SOURCE_STYLE[a.source] ?? "bg-zinc-200 text-zinc-700"}`}
                    >
                      {SOURCE_LABEL[a.source] ?? a.source}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "olive" | "amber";
}) {
  const toneCls =
    tone === "olive"
      ? "text-[#6B7B3A] dark:text-[#A8B87A]"
      : tone === "amber"
      ? "text-[#B47B2A] dark:text-amber-300"
      : "text-[#2A251D] dark:text-zinc-100";
  return (
    <div className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 px-4 py-3">
      <div className="text-[11.5px] text-[#8C8270] dark:text-zinc-500">{label}</div>
      <div className={`mt-0.5 text-[20px] font-bold ${toneCls}`}>{value}</div>
    </div>
  );
}

function todayKst(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
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
