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
  member: {
    id: number;
    name: string;
    phone: string | null;
    face_thumb: string | null;
    status: "active" | "expired";
    membership: { plan_name: string; expires_at: string; days_left: number } | null;
    expired_items: { type: "rental" | "locker"; name: string; expires_at: string }[];
  } | null;
}

const SOURCE_LABEL: Record<string, string> = {
  kiosk: "QR",
  manual: "검색",
  touch: "터치",
  app: "앱",
};

const SOURCE_STYLE: Record<string, string> = {
  kiosk: "bg-[#6B7B3A]/10 text-[#6B7B3A] dark:bg-[#6B7B3A]/30 dark:text-[#A8B87A]",
  manual: "bg-[#B47B2A]/10 text-[#B47B2A] dark:bg-amber-900/40 dark:text-amber-300",
  touch: "bg-[#6B7B3A]/10 text-[#6B7B3A] dark:bg-[#6B7B3A]/30 dark:text-[#A8B87A]",
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
  const [sourceFilter, setSourceFilter] = useState<"all" | "kiosk" | "manual" | "touch" | "app">("all");
  const [refreshedAt, setRefreshedAt] = useState<string>("");
  const [month, setMonth] = useState(() => todayKst().slice(0, 7));
  const [monthDays, setMonthDays] = useState<Record<string, { total: number; unique: number }>>({});
  const [monthLoading, setMonthLoading] = useState(false);

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

  const [cancelingId, setCancelingId] = useState<number | null>(null);
  const cancelAttendance = useCallback(
    async (a: Attendance) => {
      if (cancelingId) return;
      if (!window.confirm(`${a.member?.name ?? "회원"}님의 출석을 취소할까요?`)) return;
      setCancelingId(a.id);
      try {
        const token = await getIdToken();
        const res = await fetch(`/api/crm/attendances/${a.id}`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "취소 실패");
        setRows((prev) => prev.filter((r) => r.id !== a.id));
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "네트워크 오류");
      } finally {
        setCancelingId(null);
      }
    },
    [getIdToken, cancelingId]
  );

  const loadMonth = useCallback(async () => {
    setMonthLoading(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch(`/api/crm/attendances/monthly?month=${month}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok) setMonthDays(data.days ?? {});
    } catch {
      // 달력은 보조 정보 — 실패해도 상세 조회는 유지
    } finally {
      setMonthLoading(false);
    }
  }, [getIdToken, month]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  // 선택 날짜가 현재 표시 중인 달과 다르면 달을 맞춤
  useEffect(() => {
    const m = date.slice(0, 7);
    if (m !== month) setMonth(m);
  }, [date, month]);

  // 오늘 날짜를 새로고침하면 달력의 오늘 카운트도 갱신
  useEffect(() => {
    if (refreshedAt && date === todayKst()) loadMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshedAt]);

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
    const sources = { kiosk: 0, manual: 0, touch: 0, app: 0 };
    for (const a of rows) {
      const k = (a.source as keyof typeof sources) ?? "kiosk";
      if (k in sources) sources[k] = (sources[k] ?? 0) + 1;
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
  const peakHour = hourly.reduce(
    (best, count, hour) => (count > best.count ? { hour, count } : best),
    { hour: 0, count: 0 }
  );
  const isToday = date === todayKst();

  const shift = (delta: number) => {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + delta);
    setDate(d.toISOString().slice(0, 10));
  };

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(d.toISOString().slice(0, 7));
  };

  // 달력 셀 (일요일 시작 6주 그리드)
  const calendarCells = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const startWeekday = first.getUTCDay(); // 0=일
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells: ({ ymd: string; day: number } | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const ymd = `${month}-${String(d).padStart(2, "0")}`;
      cells.push({ ymd, day: d });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [month]);

  const monthPeople = useMemo(
    () => Object.values(monthDays).reduce((s, v) => s + v.unique, 0),
    [monthDays]
  );
  const today = todayKst();

  return (
    <div className="px-5 md:px-8 pt-3 pb-8 max-w-7xl mx-auto">
      <header className="mb-4 rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-950/60 px-5 py-4 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-[11.5px] font-semibold text-[#8C8270] dark:text-zinc-500">
              ATTENDANCE CONTROL
            </p>
            <h1 className="mt-1 text-[22px] md:text-[26px] font-bold text-[#241F18] dark:text-zinc-100">
              출석 현황
            </h1>
            <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
              {date} 기준 출석 흐름과 회원별 체크인 상태를 확인합니다.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              onClick={() => shift(-1)}
              className="h-9 px-3 rounded-lg border border-[#D9CDB8] dark:border-zinc-700 text-[13px] font-semibold text-[#3A342A] dark:text-zinc-200 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800/60"
            >
              이전
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={`${crmInputClass} !h-9 !w-auto`}
            />
            <button
              onClick={() => shift(1)}
              disabled={date >= todayKst()}
              className="h-9 px-3 rounded-lg border border-[#D9CDB8] dark:border-zinc-700 text-[13px] font-semibold text-[#3A342A] dark:text-zinc-200 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800/60 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              다음
            </button>
            <button
              onClick={() => setDate(todayKst())}
              disabled={isToday}
              className="h-9 px-3.5 rounded-lg bg-[#2F3A2B] text-white text-[13px] font-semibold disabled:opacity-40 hover:bg-[#263121] dark:bg-[#A8B87A] dark:text-zinc-950"
            >
              오늘
            </button>
            <button
              onClick={load}
              disabled={loading}
              className="h-9 px-3.5 rounded-lg border border-[#D9CDB8] dark:border-zinc-700 text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 disabled:opacity-50"
            >
              {loading ? "갱신 중" : "새로고침"}
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-5 gap-2.5">
          <KpiCard label="총 출석" value={`${stats.total}회`} hint="전체 체크인" />
          <KpiCard label="출석 회원" value={`${stats.unique}명`} hint="중복 제외" tone="olive" />
          <KpiCard label="피크 시간" value={peakHour.count > 0 ? `${peakHour.hour}시` : "—"} hint={peakHour.count > 0 ? `${peakHour.count}회 집중` : "기록 없음"} tone="blue" />
          <KpiCard label="터치/QR" value={`${stats.sources.touch + stats.sources.kiosk}회`} hint={`터치 ${stats.sources.touch} · QR ${stats.sources.kiosk}`} tone="olive" />
          <KpiCard label="수동/앱" value={`${stats.sources.manual + stats.sources.app}회`} hint={`수동 ${stats.sources.manual} · 앱 ${stats.sources.app}`} tone="amber" />
        </div>
        {refreshedAt && (
          <div className="mt-3 text-right text-[11.5px] text-[#A89B80] dark:text-zinc-500">
            최근 갱신 {formatTimeKST(refreshedAt)}
          </div>
        )}
      </header>

      <section className="mb-4 rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 flex-wrap">
        {(["all", "kiosk", "manual", "touch", "app"] as const).map((s) => (
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
              : `${SOURCE_LABEL[s]} ${stats.sources[s as "kiosk" | "manual" | "touch" | "app"] ?? 0}`}
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
      </section>

      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="mb-5 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 px-5 py-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">
                시간대별 출석 흐름
              </h2>
              <p className="mt-0.5 text-[11.5px] text-[#8C8270] dark:text-zinc-500">
                KST 기준 24시간 체크인 분포
              </p>
            </div>
            <span className="text-[11.5px] font-semibold text-[#6B7B3A] dark:text-[#A8B87A]">
              {peakHour.count > 0 ? `피크 ${peakHour.hour}시 · ${peakHour.count}회` : "출석 없음"}
            </span>
          </div>
          {rows.length === 0 ? (
            <div className="py-12 text-center text-[12.5px] text-[#8C8270]">
              데이터가 없어요.
            </div>
          ) : (
            <div className="flex items-end gap-1.5 h-28">
              {hourly.map((count, h) => {
                const ratio = count / maxHourly;
                return (
                  <div key={h} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <div className="w-full flex items-end justify-center h-full rounded-t bg-[#F7F2E8] dark:bg-zinc-950/50">
                      <div
                        className={`w-full rounded-t transition-all ${
                          count === 0
                            ? "bg-[#EDE4D4] dark:bg-zinc-800"
                            : h === peakHour.hour
                            ? "bg-[#B47B2A]"
                            : "bg-[#6B7B3A]"
                        }`}
                        style={{ height: `${Math.max(4, ratio * 100)}%` }}
                        title={`${h}시 ${count}건`}
                      />
                    </div>
                    <div className="h-3 text-[9px] text-[#A89B80] dark:text-zinc-500 leading-none">
                      {h % 3 === 0 ? `${h}` : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 px-4 py-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">
                날짜별 출입 인원
              </h2>
              <p className="mt-0.5 text-[11.5px] text-[#8C8270] dark:text-zinc-500">
                이 달 누적 {monthPeople.toLocaleString()}명
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => shiftMonth(-1)}
                className="w-7 h-7 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13px] text-[#3A342A] dark:text-zinc-200 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800/60"
              >
                ‹
              </button>
              <span className="px-1.5 text-[13px] font-semibold text-[#2A251D] dark:text-zinc-100 tabular-nums">
                {month.replace("-", ". ")}
              </span>
              <button
                onClick={() => shiftMonth(1)}
                disabled={month >= today.slice(0, 7)}
                className="w-7 h-7 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13px] text-[#3A342A] dark:text-zinc-200 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800/60 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ›
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
              <div
                key={d}
                className={`text-center text-[11px] font-medium py-1 ${
                  i === 0 ? "text-red-500/80" : i === 6 ? "text-blue-500/80" : "text-[#8C8270] dark:text-zinc-500"
                }`}
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((cell, idx) => {
              if (!cell) return <div key={`e${idx}`} />;
              const info = monthDays[cell.ymd];
              const count = info?.unique ?? 0;
              const selected = cell.ymd === date;
              const isFuture = cell.ymd > today;
              const isTodayCell = cell.ymd === today;
              return (
                <button
                  key={cell.ymd}
                  onClick={() => setDate(cell.ymd)}
                  disabled={isFuture}
                  className={`aspect-square min-h-[64px] rounded-lg border flex flex-col items-center pt-2.5 pb-2 transition-colors
                    ${selected
                      ? "border-[#2F3A2B] bg-[#2F3A2B] text-white dark:border-[#A8B87A] dark:bg-[#A8B87A] dark:text-zinc-950"
                      : isFuture
                      ? "border-transparent text-[#C9BFA8] dark:text-zinc-700 cursor-not-allowed"
                      : count > 0
                      ? "border-[#6B7B3A]/30 bg-[#6B7B3A]/8 text-[#3A342A] dark:text-zinc-200 hover:border-[#6B7B3A]/60"
                      : "border-[#E8E0D0] dark:border-zinc-800 text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800/60"
                    }`}
                >
                  <span
                    className={`text-[14px] leading-none ${
                      isTodayCell && !selected ? "font-bold text-[#6B7B3A] dark:text-[#A8B87A]" : "font-semibold"
                    }`}
                  >
                    {cell.day}
                  </span>
                  <span className="mt-auto">
                    {count > 0 ? (
                      <span
                        className={`inline-block min-w-[38px] px-2 py-1 rounded-full text-[11px] font-bold leading-none tabular-nums ${
                          selected
                            ? "bg-white/25 text-white dark:bg-zinc-950/20 dark:text-zinc-950"
                            : "bg-[#6B7B3A]/15 text-[#6B7B3A] dark:bg-[#6B7B3A]/30 dark:text-[#A8B87A]"
                        }`}
                      >
                        {count}명
                      </span>
                    ) : (
                      <span className="inline-block h-[16px]" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          {monthLoading && (
            <div className="mt-2 text-[11px] text-[#A89B80] dark:text-zinc-500">달력 불러오는 중…</div>
          )}
        </section>
      </div>

      <div className="mb-2 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[15px] font-bold text-[#241F18] dark:text-zinc-100">출석 기록</h2>
          <p className="mt-0.5 text-[11.5px] text-[#8C8270] dark:text-zinc-500">
            필터 적용 {filtered.length.toLocaleString()}건 · 전체 {rows.length.toLocaleString()}건
          </p>
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
          {rows.length === 0
            ? "이 날짜에는 출석 기록이 없어요."
            : "조건에 맞는 기록이 없어요."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 shadow-sm">
          <table className="w-full text-[13px]">
            <thead className="bg-[#F6F0E5] dark:bg-zinc-950/80 text-[#6B5D47] dark:text-zinc-400">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold whitespace-nowrap">시간</th>
                <th className="px-4 py-2.5 text-left font-semibold whitespace-nowrap">상태</th>
                <th className="px-4 py-2.5 text-left font-semibold">회원</th>
                <th className="px-4 py-2.5 text-left font-semibold">회원권</th>
                <th className="px-4 py-2.5 text-left font-semibold">만료 이용권</th>
                <th className="px-4 py-2.5 text-left font-semibold whitespace-nowrap">경로</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E0D0]/70 dark:divide-zinc-800">
              {filtered.map((a) => (
                <tr
                  key={a.id}
                  className="bg-[#FEFCF7] dark:bg-zinc-900 align-top hover:bg-[#FAF5EA] dark:hover:bg-zinc-800/55 transition-colors"
                >
                  <td className="px-4 py-3 text-[#2A251D] dark:text-zinc-100 font-bold whitespace-nowrap tabular-nums">
                    {formatTimeKST(a.checked_in_at)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {a.member?.status === "active" ? (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                        활성
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#F5F0E5] text-[#A89B80] dark:bg-zinc-800 dark:text-zinc-500">
                        만료
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {a.member?.face_thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={a.member.face_thumb}
                          alt=""
                          className="w-9 h-9 rounded-full object-cover border border-[#E8E0D0] dark:border-zinc-700 shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-[#EFE7D5] dark:bg-zinc-800 flex items-center justify-center text-[13px] font-bold text-[#A89B80] shrink-0">
                          {a.member?.name?.[0] ?? "?"}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-[#2A251D] dark:text-zinc-100 truncate">
                          {a.member?.name ?? "—"}
                        </div>
                        <div className="text-[11.5px] text-[#8C8270] dark:text-zinc-500">
                          {a.member?.phone ? formatPhone(a.member.phone) : "—"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {a.member?.membership ? (
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-semibold text-[#3A342A] dark:text-zinc-200">
                          {a.member.membership.plan_name}
                        </div>
                        <div className="text-[11.5px] text-[#6B5D47] dark:text-zinc-400">
                          {a.member.membership.expires_at === "9999-12-31" ? (
                            <span className="text-[#6B7B3A] dark:text-[#A8B87A] font-semibold">무기한</span>
                          ) : (
                            <>
                              {a.member.membership.expires_at} ·{" "}
                              <span className={a.member.membership.days_left <= 7 ? "text-[#B47B2A] dark:text-amber-300 font-semibold" : ""}>
                                {a.member.membership.days_left}일 남음
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-[#C9BEA6]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {a.member?.expired_items && a.member.expired_items.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {a.member.expired_items.map((it, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 w-fit"
                          >
                            {it.name} 만료
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[#C9BEA6]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold ${SOURCE_STYLE[a.source] ?? "bg-zinc-200 text-zinc-700"}`}
                      >
                        {SOURCE_LABEL[a.source] ?? a.source}
                      </span>
                      <button
                        onClick={() => cancelAttendance(a)}
                        disabled={cancelingId === a.id}
                        className="px-2 py-1 rounded-md border border-red-200 dark:border-red-900 text-red-600 dark:text-red-300 text-[11.5px] font-semibold hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
                      >
                        {cancelingId === a.id ? "취소 중…" : "출석 취소"}
                      </button>
                    </div>
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
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "olive" | "amber" | "blue";
}) {
  const toneCls =
    tone === "olive"
      ? "text-[#6B7B3A] dark:text-[#A8B87A]"
      : tone === "blue"
      ? "text-[#315F7D] dark:text-sky-300"
      : tone === "amber"
      ? "text-[#B47B2A] dark:text-amber-300"
      : "text-[#2A251D] dark:text-zinc-100";
  return (
    <div className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-white/75 dark:bg-zinc-900/70 px-4 py-3 min-w-0">
      <div className="text-[11.5px] font-semibold text-[#8C8270] dark:text-zinc-500">{label}</div>
      <div className={`mt-0.5 text-[20px] font-bold truncate ${toneCls}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-[#A89B80] dark:text-zinc-500 truncate">{hint}</div>}
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
