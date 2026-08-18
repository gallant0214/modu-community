"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/auth-provider";
import { ROLE_LABEL, formatWon, parseWon, formatPhone, RESERVATION_STATUS_LABEL } from "../_components/crm-labels";
import { TrainerSessionsChart } from "./_components/trainer-sessions-chart";
import { PayrollList } from "../payroll/_payroll-list";

interface MonthlyResp {
  ym: string;
  summary: {
    newMembers: number;
    memberCount: number;
    lessonMemberCount: number;
    totalRevenue: number;
    totalPassCount: number;
  };
  paymentBreakdown: Record<string, number>;
  trainers: {
    trainerMemberId: number;
    name: string;
    role: string;
    passes: { new: number; renewal: number; trial: number; service: number; total: number; revenue: number };
    reservations: { attended: number; cancelled: number; noshow: number; booked: number };
  }[];
}

type Tab = "trainer" | "center" | "settlement" | "payroll" | "lessons";

type DateMode = "year" | "month" | "range";

export default function CrmStatsPage() {
  const { getIdToken } = useAuth();
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "center";
    const t = new URLSearchParams(window.location.search).get("tab");
    return t === "payroll" || t === "trainer" || t === "settlement" || t === "center" || t === "lessons"
      ? (t as Tab)
      : "center";
  });
  // 입력값(pending) — 사용자가 드롭다운/날짜를 바꾸면 여기만 갱신됨
  const [dateMode, setDateMode] = useState<DateMode>("month");
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [ym, setYm] = useState(() => new Date().toISOString().slice(0, 7));
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  // 적용값(applied) — [검색하기] 버튼을 눌러야만 여기가 갱신되고 API 재호출됨
  const [appliedDateMode, setAppliedDateMode] = useState<DateMode>(dateMode);
  const [appliedYear, setAppliedYear] = useState(year);
  const [appliedYm, setAppliedYm] = useState(ym);
  const [appliedFrom, setAppliedFrom] = useState(from);
  const [appliedTo, setAppliedTo] = useState(to);

  const [data, setData] = useState<MonthlyResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 입력값과 적용값이 달라진 상태 여부 (버튼 강조용)
  const filtersDirty =
    dateMode !== appliedDateMode ||
    (dateMode === "year" && year !== appliedYear) ||
    (dateMode === "month" && ym !== appliedYm) ||
    (dateMode === "range" && (from !== appliedFrom || to !== appliedTo));

  // API 쿼리 문자열 (탭 공용) — 적용값 기준
  const rangeQs = (() => {
    if (appliedDateMode === "year") {
      return `from=${appliedYear}-01-01&to=${appliedYear}-12-31`;
    }
    if (appliedDateMode === "range" && appliedFrom && appliedTo && appliedTo >= appliedFrom) {
      return `from=${appliedFrom}&to=${appliedTo}`;
    }
    return `ym=${appliedYm}`;
  })();

  const applyFilters = () => {
    setAppliedDateMode(dateMode);
    setAppliedYear(year);
    setAppliedYm(ym);
    setAppliedFrom(from);
    setAppliedTo(to);
  };

  // 연도 선택지 (현재 연도 기준 -5 ~ +1)
  const currentYear = new Date().getFullYear();
  const yearOptions = [] as number[];
  for (let y = currentYear + 1; y >= currentYear - 5; y -= 1) yearOptions.push(y);

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch(`/api/crm/stats/monthly?${rangeQs}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "조회 실패");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, rangeQs]);

  useEffect(() => {
    load();
  }, [load]);

  // 현재 탭을 URL(?tab=)에 반영 → 강사 급여 상세에서 뒤로가기 시 같은 탭으로 복귀
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (tab === "center") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url.toString());
  }, [tab]);

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-6xl mx-auto">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
            통계
          </h1>
          <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
            {tab === "lessons"
              ? "센터에서 진행된 수업(출석·노쇼) 목록을 기간·강사별로 확인해요."
              : tab === "payroll"
              ? "강사를 선택하면 매출·담당 회원·수업 내역·급여를 확인할 수 있어요."
              : tab === "trainer"
              ? `강사별 매출과 수업 현황을 ${appliedDateMode === "year" ? "연 단위" : appliedDateMode === "month" ? "월 단위" : "지정 기간"}로 확인해요.`
              : tab === "center"
              ? `센터 매출(회원권·운동복·락커·기타)을 ${appliedDateMode === "year" ? "연 단위" : appliedDateMode === "month" ? "월 단위" : "지정 기간"}로 확인해요.`
              : `총매출에서 고정지출·부가세·직원급여·추가지출을 뺀 순이익을 ${appliedDateMode === "year" ? "연 단위" : appliedDateMode === "month" ? "월 단위" : "지정 기간"}로 정산해요.`}
          </p>
        </div>
        {tab !== "payroll" && tab !== "lessons" && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-[#E8E0D0] dark:border-zinc-700 overflow-hidden">
            <ModeBtn active={dateMode === "year"} onClick={() => setDateMode("year")}>
              년도
            </ModeBtn>
            <ModeBtn active={dateMode === "month"} onClick={() => setDateMode("month")}>
              월별
            </ModeBtn>
            <ModeBtn active={dateMode === "range"} onClick={() => setDateMode("range")}>
              직접 선택
            </ModeBtn>
          </div>
          {dateMode === "year" ? (
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="px-3 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[13px] text-[#2A251D] dark:text-zinc-100"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
          ) : dateMode === "month" ? (
            <input
              type="month"
              value={ym}
              onChange={(e) => setYm(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[13px] text-[#2A251D] dark:text-zinc-100"
            />
          ) : (
            <div className="inline-flex items-center gap-1">
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="px-2 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[13px] text-[#2A251D] dark:text-zinc-100"
              />
              <span className="text-[12px] text-[#A89B80]">~</span>
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="px-2 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[13px] text-[#2A251D] dark:text-zinc-100"
              />
            </div>
          )}
          <button
            type="button"
            onClick={applyFilters}
            disabled={loading}
            className={`px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition-colors disabled:opacity-50 ${
              filtersDirty
                ? "bg-[#6B7B3A] text-white hover:bg-[#5a6932] shadow-sm"
                : "border border-[#E8E0D0] dark:border-zinc-700 text-[#6B5D47] dark:text-zinc-300 bg-[#FEFCF7] dark:bg-zinc-900 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
            }`}
            title={filtersDirty ? "선택한 조건으로 조회" : "다시 조회"}
          >
            {loading ? "조회 중…" : filtersDirty ? "검색하기" : "다시 조회"}
          </button>
        </div>
        )}
      </header>

      <div className="mb-5 flex gap-1.5 border-b border-[#E8E0D0] dark:border-zinc-800">
        <TabBtn active={tab === "center"} onClick={() => setTab("center")}>
          센터 매출
        </TabBtn>
        <TabBtn active={tab === "trainer"} onClick={() => setTab("trainer")}>
          강사 매출
        </TabBtn>
        <TabBtn active={tab === "settlement"} onClick={() => setTab("settlement")}>
          정산
        </TabBtn>
        <TabBtn active={tab === "payroll"} onClick={() => setTab("payroll")}>
          직원 급여
        </TabBtn>
        <TabBtn active={tab === "lessons"} onClick={() => setTab("lessons")}>
          수업진행목록
        </TabBtn>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {tab === "payroll" ? (
        <PayrollList />
      ) : tab === "lessons" ? (
        <LessonsTab />
      ) : loading ? (
        <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : tab === "trainer" ? (
        <TrainerTab data={data} />
      ) : tab === "center" ? (
        <CenterTab rangeQs={rangeQs} />
      ) : (
        <SettlementTab rangeQs={rangeQs} defaultYm={appliedYm} />
      )}
    </div>
  );
}

/* ─── 수업진행목록 탭 ────────────────────────────── */

interface LessonRow {
  id: number;
  starts_at: string;
  status: string;
  member_id: number;
  member_name: string;
  member_phone: string | null;
  trainer_member_id: number;
  trainer_name: string;
  lesson_kind: string | null;
}
interface StaffLite {
  id: number;
  display_name: string;
  role: string;
  status: string;
}

const localYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ISO(UTC) → KST "8/17 (일) 14:30"
function fmtKstDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const mo = k.getUTCMonth() + 1;
  const day = k.getUTCDate();
  const dow = ["일", "월", "화", "수", "목", "금", "토"][k.getUTCDay()];
  const hh = String(k.getUTCHours()).padStart(2, "0");
  const mm = String(k.getUTCMinutes()).padStart(2, "0");
  return `${mo}/${day} (${dow}) ${hh}:${mm}`;
}

function LessonsTab() {
  const { getIdToken } = useAuth();
  const now = new Date();
  // 기본값: 이번 달 1일 ~ 말일 (달에 따라 28/29/30/31 자동)
  const [from, setFrom] = useState(() => localYmd(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(() => localYmd(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
  const [trainerId, setTrainerId] = useState<number | "">("");
  const [staff, setStaff] = useState<StaffLite[]>([]);
  const [rows, setRows] = useState<LessonRow[]>([]);
  const [summary, setSummary] = useState<{ total: number; attended: number; noshow: number } | null>(null);
  const [fullView, setFullView] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 강사 목록 (활성)
  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        const res = await fetch("/api/crm/staff", { headers: { authorization: `Bearer ${token}` } });
        if (res.ok) {
          const d = await res.json();
          setStaff((d.staff ?? []).filter((s: StaffLite) => s.status === "active"));
        }
      } catch {
        /* ignore */
      }
    })();
  }, [getIdToken]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const params = new URLSearchParams({ from, to });
      if (trainerId) params.set("trainer_id", String(trainerId));
      const res = await fetch(`/api/crm/stats/lessons?${params}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setRows(data.lessons ?? []);
      setSummary(data.summary ?? null);
      setFullView(data.full_view !== false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, from, to, trainerId]);

  // 최초 1회 자동 조회
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inputCls =
    "px-2.5 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[13px] text-[#2A251D] dark:text-zinc-100";

  return (
    <div className="space-y-4">
      {/* 필터 바 */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[11.5px] text-[#8C8270]">
          시작일
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] text-[#8C8270]">
          종료일
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] text-[#8C8270]">
          강사
          <select
            value={trainerId}
            onChange={(e) => setTrainerId(e.target.value ? Number(e.target.value) : "")}
            disabled={!fullView}
            className={`${inputCls} disabled:opacity-60`}
          >
            <option value="">전체 강사</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932] disabled:opacity-50"
        >
          {loading ? "조회 중…" : "조회하기"}
        </button>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {summary && (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="px-2.5 py-1 rounded-full bg-[#F5F0E5] dark:bg-zinc-800 text-[#3A342A] dark:text-zinc-300 font-semibold">
            총 {summary.total}건
          </span>
          <span className="px-2.5 py-1 rounded-full bg-[#EFE7D5] text-[#6B7B3A] dark:bg-[#6B7B3A]/20 dark:text-[#A8B87A] font-semibold">
            출석 {summary.attended}
          </span>
          <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 font-semibold">
            노쇼 {summary.noshow}
          </span>
        </div>
      )}

      {loading ? (
        <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-10 text-center text-[13px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
          해당 기간에 진행된 수업이 없어요.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#E8E0D0] dark:border-zinc-800">
          <table className="w-full text-[13px]">
            <thead className="bg-[#F6F0E5] dark:bg-zinc-950/80 text-[#6B5D47] dark:text-zinc-400">
              <tr>
                <th className="text-left font-medium px-3 py-2.5 whitespace-nowrap">수업 일시</th>
                <th className="text-left font-medium px-3 py-2.5">회원</th>
                <th className="text-left font-medium px-3 py-2.5">강사</th>
                <th className="text-left font-medium px-3 py-2.5">수업</th>
                <th className="text-left font-medium px-3 py-2.5 whitespace-nowrap">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E0D0]/70 dark:divide-zinc-800">
              {rows.map((r) => (
                <tr key={r.id} className="bg-[#FEFCF7] dark:bg-zinc-900">
                  <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-[#3A342A] dark:text-zinc-300">
                    {fmtKstDateTime(r.starts_at)}
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/crm/members/${r.member_id}`}
                      className="font-semibold text-[#2A251D] dark:text-zinc-100 hover:text-[#6B7B3A] hover:underline"
                    >
                      {r.member_name}
                    </Link>
                    {r.member_phone && (
                      <span className="ml-2 text-[11.5px] text-[#A89B80]">{formatPhone(r.member_phone)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[#3A342A] dark:text-zinc-300">{r.trainer_name}</td>
                  <td className="px-3 py-2.5 text-[#6B5D47] dark:text-zinc-400 truncate max-w-[220px]">
                    {r.lesson_kind ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded text-[11.5px] font-semibold ${
                        r.status === "attended"
                          ? "bg-[#EFE7D5] text-[#6B7B3A] dark:bg-[#6B7B3A]/20 dark:text-[#A8B87A]"
                          : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                      }`}
                    >
                      {RESERVATION_STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!fullView && (
        <p className="text-[11.5px] text-[#A89B80]">본인이 담당한 수업만 표시됩니다.</p>
      )}
    </div>
  );
}

/* ─── CSV 다운로드 (엑셀 호환) ────────────────────────────── */

function downloadCsv(filenameBase: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) =>
      r.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")
    )
    .join("\r\n");
  const bom = "﻿"; // Excel 에서 한글 깨짐 방지
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const ts = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${filenameBase}_${ts}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── 강사 매출 탭 ────────────────────────────── */

function TrainerTab({ data }: { data: MonthlyResp | null }) {
  if (!data) return null;

  const exportCsv = () => {
    const header = ["강사", "등급", "신규(건)", "재등록(건)", "체험(건)", "매출(원)", "출석완료(회)", "취소(회)", "노쇼(회)"];
    const body = data.trainers.map((t) => [
      t.name,
      ROLE_LABEL[t.role] ?? t.role,
      t.passes.new,
      t.passes.renewal,
      t.passes.trial,
      t.passes.revenue,
      t.reservations.attended,
      t.reservations.cancelled,
      t.reservations.noshow,
    ]);
    // 합계 행
    const sum = data.trainers.reduce(
      (a, t) => ({
        n: a.n + t.passes.new,
        r: a.r + t.passes.renewal,
        tri: a.tri + t.passes.trial,
        rev: a.rev + t.passes.revenue,
        att: a.att + t.reservations.attended,
        can: a.can + t.reservations.cancelled,
        ns: a.ns + t.reservations.noshow,
      }),
      { n: 0, r: 0, tri: 0, rev: 0, att: 0, can: 0, ns: 0 }
    );
    body.push(["합계", "", sum.n, sum.r, sum.tri, sum.rev, sum.att, sum.can, sum.ns]);
    downloadCsv(`강사매출_${data.ym}`, [header, ...body]);
  };

  return (
    <>
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Kpi label="레슨 회원 수" value={`${data.summary.lessonMemberCount}명`} />
        <Kpi label="PT매출" value={`${formatWon(data.summary.totalRevenue)}원`} accent />
        <Kpi label="수강권 발급" value={`${data.summary.totalPassCount}건`} />
        <Kpi
          label="재직 강사"
          value={`${data.trainers.length}명`}
          sub={(() => {
            const active = data.trainers.filter(
              (t) => t.passes.total > 0 || t.reservations.attended > 0
            ).length;
            return `이번달 활동 ${active}명`;
          })()}
        />
      </section>

      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={exportCsv}
          disabled={data.trainers.length === 0}
          className="px-3 py-1.5 rounded-lg border border-[#6B7B3A] text-[#6B7B3A] dark:border-[#A8B87A] dark:text-[#A8B87A] text-[12.5px] font-semibold hover:bg-[#6B7B3A]/5 disabled:opacity-50"
        >
          📥 엑셀 다운로드
        </button>
      </div>

      <section className="overflow-x-auto rounded-2xl border border-[#E8E0D0] dark:border-zinc-800">
        <table className="w-full text-[13px]">
          <thead className="bg-[#FBF7EB] dark:bg-zinc-900/80 text-[#6B5D47] dark:text-zinc-400">
            <tr>
              <Th>강사</Th>
              <Th>등급</Th>
              <Th>신규</Th>
              <Th>재등록</Th>
              <Th>체험</Th>
              <Th>매출</Th>
              <Th>출석완료</Th>
              <Th>취소</Th>
              <Th>노쇼</Th>
            </tr>
          </thead>
          <tbody>
            {data.trainers.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-[#8C8270]">
                  이번달 활동 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              data.trainers.map((t) => (
                <tr
                  key={t.trainerMemberId}
                  className="border-t border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 hover:bg-[#FBF7EB] dark:hover:bg-zinc-900/60"
                >
                  <Td>
                    <Link
                      href={`/crm/stats/${t.trainerMemberId}`}
                      className="font-semibold text-[#2A251D] dark:text-zinc-100 hover:text-[#6B7B3A]"
                    >
                      {t.name}
                    </Link>
                  </Td>
                  <Td className="text-[#8C8270]">{ROLE_LABEL[t.role] ?? t.role}</Td>
                  <Td>{t.passes.new}건</Td>
                  <Td>{t.passes.renewal}건</Td>
                  <Td>{t.passes.trial}건</Td>
                  <Td className="font-semibold">{formatWon(t.passes.revenue)}원</Td>
                  <Td>{t.reservations.attended}회</Td>
                  <Td>
                    <Link
                      href={`/crm/stats/${t.trainerMemberId}?tab=cancel`}
                      className="text-[#6B7B3A] dark:text-[#A8B87A] hover:underline font-medium"
                    >
                      {t.reservations.cancelled}회
                    </Link>
                  </Td>
                  <Td className="text-red-600 dark:text-red-400">{t.reservations.noshow}회</Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {/* 강사별 월별 수업 진행 수 (12개월, 강사 선택) */}
      <TrainerSessionsChart />
    </>
  );
}

/* ─── 센터 매출 탭 ────────────────────────────── */

interface PaymentBucket {
  cash: number;
  card: number;
  culture: number;
  other: number;
}
interface RegBucket {
  new: number;
  renewal: number;
  unknown: number;
}
interface CenterRevenueResp {
  ym: string;
  total: number;
  total_ex_vat: number;
  vat_amount: number;
  counts: { memberships: number; passes: number };
  categories: {
    membership: number;
    pass: number;
    locker: number;
    goods: number;
    etc: number;
  };
  categories_ex_vat: {
    membership: number;
    pass: number;
    locker: number;
    goods: number;
    etc: number;
  };
  potential_liability: number;
  potential_liability_ex_vat: number;
  potential_liability_vat: number;
  liability_breakdown: {
    membership: number;
    pass: number;
    notStarted: number;
    inProgress: number;
  };
  payment_totals: {
    total: PaymentBucket;
    membership: PaymentBucket;
    pass: PaymentBucket;
  };
  registration_totals: {
    total: RegBucket;
    membership: RegBucket;
    pass: RegBucket;
  };
}

function CenterTab({ rangeQs }: { rangeQs: string }) {
  const { getIdToken } = useAuth();
  const [data, setData] = useState<CenterRevenueResp | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch(`/api/crm/stats/center-revenue?${rangeQs}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [getIdToken, rangeQs]);

  useEffect(() => {
    load();
  }, [load]);

  const cats: { key: keyof CenterRevenueResp["categories"]; label: string; href?: string }[] = [
    { key: "membership", label: "회원권 매출 (헬스·락커·운동복)", href: "/crm/memberships" },
    { key: "pass", label: "수강권 매출 (PT·레슨)", href: "/crm/passes" },
  ];

  const exportCsv = () => {
    if (!data) return;
    const rows: (string | number)[][] = [];
    rows.push(["항목", "부가세 포함(원)", "부가세 제외(원)"]);
    rows.push(["센터 매출 합계", data.total, data.total_ex_vat]);
    rows.push(["부가세", data.vat_amount, 0]);
    rows.push([]);
    rows.push(["카테고리별"]);
    for (const c of cats) {
      rows.push([c.label, data.categories[c.key] ?? 0, data.categories_ex_vat[c.key] ?? 0]);
    }
    rows.push([]);
    rows.push(["잠재부채(선수금)", data.potential_liability]);
    rows.push(["  회원권", data.liability_breakdown.membership]);
    rows.push(["  수강권", data.liability_breakdown.pass]);
    rows.push(["  미시작", data.liability_breakdown.notStarted]);
    rows.push(["  진행중", data.liability_breakdown.inProgress]);
    rows.push([]);
    rows.push(["결제수단별", "현금(원)", "카드(원)", "문화상품권(원)", "기타(원)"]);
    (
      [
        ["전체", data.payment_totals.total],
        ["회원권", data.payment_totals.membership],
        ["수강권", data.payment_totals.pass],
      ] as const
    ).forEach(([label, b]) => {
      rows.push([label, b.cash, b.card, b.culture, b.other]);
    });
    rows.push([]);
    rows.push(["신규·재등록", "신규(원)", "재등록(원)", "미분류(원)"]);
    (
      [
        ["전체", data.registration_totals.total],
        ["회원권", data.registration_totals.membership],
        ["수강권", data.registration_totals.pass],
      ] as const
    ).forEach(([label, b]) => {
      rows.push([label, b.new, b.renewal, b.unknown]);
    });
    rows.push([]);
    rows.push(["이번달 활동 건수"]);
    rows.push(["회원권 발급 수", data.counts.memberships]);
    rows.push(["수강권 발급 수", data.counts.passes]);
    downloadCsv(`센터매출_${data.ym}`, rows);
  };

  if (loading) {
    return <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>;
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={exportCsv}
          disabled={!data}
          className="px-3 py-1.5 rounded-lg border border-[#6B7B3A] text-[#6B7B3A] dark:border-[#A8B87A] dark:text-[#A8B87A] text-[12.5px] font-semibold hover:bg-[#6B7B3A]/5 disabled:opacity-50"
        >
          📥 엑셀 다운로드
        </button>
      </div>

      {/* 요약 KPI 3종: 부가세 포함 매출 / 부가세 제외 실매출 / 잠재부채 */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <Kpi label="센터 매출 합계 (부가세 포함)" value={`${formatWon(data?.total ?? 0)}원`} accent />
        <Kpi
          label="실매출 (부가세 제외)"
          value={`${formatWon(data?.total_ex_vat ?? 0)}원`}
          sub={`부가세 ${formatWon(data?.vat_amount ?? 0)}원`}
        />
        <Kpi
          label="잠재부채 (선수금)"
          value={`${formatWon(data?.potential_liability ?? 0)}원`}
          tone="warn"
          sub={`미시작 ${formatWon(data?.liability_breakdown.notStarted ?? 0)}원 · 진행중 ${formatWon(data?.liability_breakdown.inProgress ?? 0)}원`}
        />
      </section>

      {/* 이번달 활동 건수 */}
      <section className="mb-5 px-4 py-2 rounded-xl border border-[#E8E0D0]/60 dark:border-zinc-800 bg-[#FBF7EB]/40 dark:bg-zinc-900/40 flex items-center justify-between">
        <span className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
          이번달 활동
        </span>
        <span className="text-[13px] font-semibold text-[#3A342A] dark:text-zinc-200">
          {(data?.counts.memberships ?? 0) + (data?.counts.passes ?? 0)}건
          <span className="ml-2 text-[11.5px] font-normal text-[#8C8270]">
            (회원권 {data?.counts.memberships ?? 0}, 수강권 {data?.counts.passes ?? 0})
          </span>
        </span>
      </section>

      {/* 카테고리별 매출 */}
      <div className="mb-2 text-[12.5px] font-semibold text-[#3A342A] dark:text-zinc-200">
        카테고리별 매출
      </div>
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
        {cats.map((c) => {
          const v = data?.categories[c.key] ?? 0;
          const exVat = data?.categories_ex_vat[c.key] ?? 0;
          const tracked = c.key === "membership" || c.key === "pass";
          return (
            <div
              key={c.key}
              className="px-5 py-4 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900"
            >
              <div className="text-[12.5px] text-[#A89B80] dark:text-zinc-500">{c.label}</div>
              <div
                className={`mt-1 text-[18px] font-bold ${tracked ? "text-[#6B7B3A] dark:text-[#A8B87A]" : "text-[#2A251D] dark:text-zinc-100"}`}
              >
                {formatWon(v)}원
              </div>
              {tracked && v > 0 && (
                <div className="mt-0.5 text-[11.5px] text-[#8C8270] dark:text-zinc-500">
                  부가세 제외 {formatWon(exVat)}원
                </div>
              )}
              <div className="mt-2 text-[11.5px] text-[#A89B80] dark:text-zinc-500">
                {tracked ? (
                  <>
                    이번달 발급 기준
                    {c.href && (
                      <>
                        {" "}
                        <a href={c.href} className="text-[#6B7B3A] dark:text-[#A8B87A] hover:underline">
                          상세 보기
                        </a>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    매출 데이터 수집 기능을 준비 중이에요.
                    {c.href && (
                      <>
                        {" "}
                        <a href={c.href} className="text-[#6B7B3A] dark:text-[#A8B87A] hover:underline">
                          관련 페이지로 이동
                        </a>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* 결제수단별 매출 */}
      <div className="mb-2 text-[12.5px] font-semibold text-[#3A342A] dark:text-zinc-200">
        결제수단별 매출
      </div>
      <PaymentBreakdown data={data} />

      {/* 신규 / 재등록 매출 */}
      <div className="mt-4 mb-2 text-[12.5px] font-semibold text-[#3A342A] dark:text-zinc-200">
        신규 · 재등록 매출
      </div>
      <RegistrationBreakdown data={data} />

      {/* 부가세 (선택 기간 결제 기준) */}
      <div className="mt-4 mb-2 text-[12.5px] font-semibold text-[#3A342A] dark:text-zinc-200">
        부가세 (선택 기간 결제 기준)
      </div>
      <section className="mb-5 px-5 py-4 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FBF7EB]/50 dark:bg-zinc-900/60">
        <div className="text-[11.5px] text-[#A89B80]">부가세 (10%)</div>
        <div className="mt-0.5 text-[20px] font-bold text-[#B47B2A] dark:text-amber-300 tabular-nums">
          {formatWon(data?.vat_amount ?? 0)}원
        </div>
        <div className="mt-2.5 text-[11.5px] text-[#A89B80]">
          결제 시 “부가세 포함”으로 체크된 상품만 10%를 분리해 합산해요. 선택한 기간(월/직접 선택)에 결제된 건 기준이에요.
        </div>
      </section>

      {/* 잠재부채 상세 */}
      <div className="mb-2 text-[12.5px] font-semibold text-[#3A342A] dark:text-zinc-200">
        잠재부채 상세
      </div>
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="px-5 py-4 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
          <div className="text-[12.5px] text-[#A89B80]">회원권 잠재부채 (헬스·락커·운동복)</div>
          <div className="mt-1 text-[18px] font-bold text-[#B47B2A] dark:text-amber-300">
            {formatWon(data?.liability_breakdown.membership ?? 0)}원
          </div>
          <div className="mt-2 text-[11.5px] text-[#A89B80]">
            아직 이용하지 않은 회원권 금액 (일할 계산)
          </div>
        </div>
        <div className="px-5 py-4 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
          <div className="text-[12.5px] text-[#A89B80]">수강권 잠재부채 (PT·레슨)</div>
          <div className="mt-1 text-[18px] font-bold text-[#B47B2A] dark:text-amber-300">
            {formatWon(data?.liability_breakdown.pass ?? 0)}원
          </div>
          <div className="mt-2 text-[11.5px] text-[#A89B80]">
            남은 회차 × 회당 단가 (미시작 건은 전액)
          </div>
        </div>
      </section>

      <div className="mt-3 px-4 py-3 rounded-xl bg-[#FBF7EB]/60 dark:bg-zinc-900/40 text-[11.5px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed">
        💡 <strong>잠재부채</strong>는 회원이 결제했으나 아직 이용하지 않은 금액이에요. 예) 7월에 60만원 PT 10회를 결제하고 8월부터 시작한다면, 오늘 시점 잠재부채는 60만원. 진행 중인 상품은 남은 일수/횟수 비율로 계산해요.
        <br />
        💡 <strong>부가세</strong>는 결제 시 상품에 &quot;부가세 포함&quot; 옵션을 체크한 건만 10% 를 제외한 실매출로 환산해요.
      </div>
    </>
  );
}

/* ─── 결제수단·등록타입 브레이크다운 컴포넌트 ────────────── */

function PaymentBreakdown({ data }: { data: CenterRevenueResp | null }) {
  const rows: {
    label: string;
    bucket: PaymentBucket | undefined;
    tone?: "membership" | "pass";
  }[] = [
    { label: "전체 매출", bucket: data?.payment_totals.total },
    { label: "회원권 매출", bucket: data?.payment_totals.membership, tone: "membership" },
    { label: "수강권 매출", bucket: data?.payment_totals.pass, tone: "pass" },
  ];
  return (
    <section className="overflow-x-auto -mx-2 px-2 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
      <table className="w-full text-[13px] min-w-[520px]">
        <thead className="text-[#8C8270] dark:text-zinc-500 border-b border-[#E8E0D0] dark:border-zinc-800">
          <tr>
            <th className="text-left py-2 pl-4 pr-2 font-semibold">구분</th>
            <th className="text-right py-2 px-2 font-semibold">현금</th>
            <th className="text-right py-2 px-2 font-semibold">카드</th>
            <th className="text-right py-2 px-2 font-semibold">문화상품권</th>
            <th className="text-right py-2 pr-4 pl-2 font-semibold">기타</th>
          </tr>
        </thead>
        <tbody className="text-[#2A251D] dark:text-zinc-200">
          {rows.map((r) => (
            <tr
              key={r.label}
              className="border-b border-[#E8E0D0]/50 dark:border-zinc-800/70 last:border-b-0"
            >
              <td className="py-2 pl-4 pr-2 font-semibold">{r.label}</td>
              <td className="py-2 px-2 text-right tabular-nums">
                {formatWon(r.bucket?.cash ?? 0)}원
              </td>
              <td className="py-2 px-2 text-right tabular-nums">
                {formatWon(r.bucket?.card ?? 0)}원
              </td>
              <td className="py-2 px-2 text-right tabular-nums text-[#8C8270]">
                {formatWon(r.bucket?.culture ?? 0)}원
              </td>
              <td className="py-2 pr-4 pl-2 text-right tabular-nums text-[#8C8270]">
                {formatWon(r.bucket?.other ?? 0)}원
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 text-[11px] text-[#A89B80]">
        기타 = 총 결제금액 − (현금+카드+문화상품권). 계좌이체·상품권·포인트 등 기타 결제 수단 포함.
      </div>
    </section>
  );
}

function RegistrationBreakdown({ data }: { data: CenterRevenueResp | null }) {
  const total = data?.registration_totals.total;
  const totalSum = (total?.new ?? 0) + (total?.renewal ?? 0) + (total?.unknown ?? 0);
  const pctNew = totalSum > 0 ? Math.round(((total?.new ?? 0) / totalSum) * 100) : 0;
  const pctRe = totalSum > 0 ? Math.round(((total?.renewal ?? 0) / totalSum) * 100) : 0;
  const rows: { label: string; bucket: RegBucket | undefined; accent: boolean }[] = [
    { label: "전체 매출", bucket: total, accent: true },
    { label: "회원권 매출", bucket: data?.registration_totals.membership, accent: false },
    { label: "수강권 매출 (PT·레슨)", bucket: data?.registration_totals.pass, accent: false },
  ];
  return (
    <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 overflow-hidden">
      {/* 전체 요약 바 */}
      <div className="px-4 pt-3 pb-2">
        <div className="text-[11.5px] text-[#A89B80]">
          전체 <strong className="text-[#6B7B3A] dark:text-[#A8B87A]">신규 {pctNew}%</strong> ·
          <strong className="ml-1 text-[#B47B2A] dark:text-amber-300">재등록 {pctRe}%</strong>
        </div>
        {totalSum > 0 && (
          <div className="mt-1.5 h-2 rounded-full bg-[#EFE7D5] dark:bg-zinc-800 overflow-hidden flex">
            <div
              className="h-full bg-[#6B7B3A]"
              style={{ width: `${pctNew}%` }}
              title={`신규 ${pctNew}%`}
            />
            <div
              className="h-full bg-[#B47B2A]"
              style={{ width: `${pctRe}%` }}
              title={`재등록 ${pctRe}%`}
            />
          </div>
        )}
      </div>

      <div className="overflow-x-auto -mx-2 px-2">
        <table className="w-full text-[13px] min-w-[520px]">
          <thead className="text-[#8C8270] dark:text-zinc-500 border-b border-[#E8E0D0] dark:border-zinc-800">
            <tr>
              <th className="text-left py-2 pl-4 pr-2 font-semibold">구분</th>
              <th className="text-right py-2 px-2 font-semibold">신규</th>
              <th className="text-right py-2 px-2 font-semibold">재등록</th>
              <th className="text-right py-2 pr-4 pl-2 font-semibold">미분류</th>
            </tr>
          </thead>
          <tbody className="text-[#2A251D] dark:text-zinc-200">
            {rows.map((r) => (
              <tr
                key={r.label}
                className={`border-b border-[#E8E0D0]/50 dark:border-zinc-800/70 last:border-b-0 ${r.accent ? "bg-[#FBF7EB]/40 dark:bg-zinc-900/60" : ""}`}
              >
                <td className="py-2 pl-4 pr-2 font-semibold">{r.label}</td>
                <td className="py-2 px-2 text-right tabular-nums text-[#6B7B3A] dark:text-[#A8B87A]">
                  {formatWon(r.bucket?.new ?? 0)}원
                </td>
                <td className="py-2 px-2 text-right tabular-nums text-[#B47B2A] dark:text-amber-300">
                  {formatWon(r.bucket?.renewal ?? 0)}원
                </td>
                <td className="py-2 pr-4 pl-2 text-right tabular-nums text-[#8C8270]">
                  {formatWon(r.bucket?.unknown ?? 0)}원
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 text-[11px] text-[#A89B80]">
        &lsquo;미분류&rsquo; = 결제 원장에 등록타입이 남아있지 않은 legacy/자동유입 건. 신규+재등록 합계와 총 매출의 차이만큼 표시돼요.
      </div>
    </section>
  );
}

/* ─── 정산 탭 ────────────────────────────── */

interface SettlementResp {
  ym: string;
  months: string[];
  months_in_period: number;
  total_revenue: number;
  total_ex_vat: number;
  vat_amount: number;
  fixed_monthly: number;
  fixed_total: number;
  salary_total: number;
  staff_breakdown: { id: number; name: string; base: number; commission: number; total: number }[];
  additional_total: number;
  net_profit: number;
}

interface AdditionalExpense {
  id: number;
  ym: string;
  label: string;
  amount_won: number;
  memo: string | null;
}

function SettlementTab({ rangeQs, defaultYm }: { rangeQs: string; defaultYm: string }) {
  const { getIdToken } = useAuth();
  const [data, setData] = useState<SettlementResp | null>(null);
  const [loading, setLoading] = useState(true);

  // 추가 지출 관리 (귀속 월 단위)
  const [expenseYm, setExpenseYm] = useState(defaultYm);
  const [addList, setAddList] = useState<AdditionalExpense[]>([]);
  const [nLabel, setNLabel] = useState("");
  const [nAmount, setNAmount] = useState("");
  const [nMemo, setNMemo] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [eLabel, setELabel] = useState("");
  const [eAmount, setEAmount] = useState("");
  const [eMemo, setEMemo] = useState("");

  const loadSettlement = useCallback(async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch(`/api/crm/stats/settlement?${rangeQs}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [getIdToken, rangeQs]);

  const loadAddList = useCallback(async () => {
    const token = await getIdToken();
    if (!token) return;
    const res = await fetch(`/api/crm/additional-expenses?ym=${expenseYm}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.ok) {
      const j = await res.json();
      setAddList(j.items ?? []);
    }
  }, [getIdToken, expenseYm]);

  useEffect(() => {
    loadSettlement();
  }, [loadSettlement]);
  useEffect(() => {
    loadAddList();
  }, [loadAddList]);

  const add = async () => {
    setError("");
    const label = nLabel.trim();
    if (!label) return setError("내용을 입력해 주세요");
    setAdding(true);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/additional-expenses", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ ym: expenseYm, label, amount_won: parseWon(nAmount), memo: nMemo.trim() || null }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "추가 실패");
      setNLabel("");
      setNAmount("");
      setNMemo("");
      loadAddList();
      loadSettlement();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (x: AdditionalExpense) => {
    setEditingId(x.id);
    setELabel(x.label);
    setEAmount(String(x.amount_won ?? 0));
    setEMemo(x.memo ?? "");
  };
  const saveEdit = async () => {
    if (!editingId) return;
    const label = eLabel.trim();
    if (!label) return setError("내용을 입력해 주세요");
    const token = await getIdToken();
    const res = await fetch(`/api/crm/additional-expenses/${editingId}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ label, amount_won: parseWon(eAmount), memo: eMemo.trim() || null }),
    });
    if (res.ok) {
      setEditingId(null);
      loadAddList();
      loadSettlement();
    }
  };
  const remove = async (id: number) => {
    if (!window.confirm("이 추가 지출을 삭제할까요?")) return;
    const token = await getIdToken();
    const res = await fetch(`/api/crm/additional-expenses/${id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      loadAddList();
      loadSettlement();
    }
  };

  if (loading) {
    return <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>;
  }

  const multiMonth = (data?.months_in_period ?? 1) > 1;
  const net = data?.net_profit ?? 0;

  return (
    <>
      {/* 순이익 카드 */}
      <section className="mb-4 px-5 py-5 rounded-2xl border-2 border-[#6B7B3A]/40 bg-[#6B7B3A]/5 dark:bg-[#6B7B3A]/10">
        <div className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">순이익</div>
        <div className={`mt-1 text-[26px] font-bold tabular-nums ${net < 0 ? "text-red-600 dark:text-red-400" : "text-[#3A342A] dark:text-zinc-100"}`}>
          {formatWon(net)}원
        </div>
        {multiMonth && (
          <div className="mt-1 text-[11.5px] text-[#A89B80]">
            선택 기간 {data?.months_in_period}개월 합산 (고정지출·직원 고정급은 개월수만큼 반영)
          </div>
        )}
      </section>

      {/* 계산 상세 */}
      <section className="mb-5 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 overflow-hidden">
        <SettleRow label="총 매출 (부가세 포함)" value={data?.total_revenue ?? 0} sign="" strong />
        <SettleRow label="− 고정 지출" value={-(data?.fixed_total ?? 0)} sub={multiMonth ? `월 ${formatWon(data?.fixed_monthly ?? 0)}원 × ${data?.months_in_period}개월` : undefined} />
        <SettleRow label="− 부가세" value={-(data?.vat_amount ?? 0)} sub="부가세 포함 결제 건의 10%" />
        <SettleRow label="− 직원 급여" value={-(data?.salary_total ?? 0)} sub="고정급 + 수업료(정산)" />
        <SettleRow label="− 추가 지출" value={-(data?.additional_total ?? 0)} />
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#6B7B3A]/8 dark:bg-[#6B7B3A]/15 border-t border-[#6B7B3A]/25">
          <span className="text-[13.5px] font-bold text-[#3A342A] dark:text-zinc-100">= 순이익</span>
          <span className={`text-[16px] font-bold tabular-nums ${net < 0 ? "text-red-600 dark:text-red-400" : "text-[#6B7B3A] dark:text-[#A8B87A]"}`}>
            {formatWon(net)}원
          </span>
        </div>
      </section>

      {/* 직원 급여 상세 */}
      {(data?.staff_breakdown.length ?? 0) > 0 && (
        <>
          <div className="mb-2 text-[12.5px] font-semibold text-[#3A342A] dark:text-zinc-200">직원 급여 상세</div>
          <section className="mb-5 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 overflow-hidden">
            {data?.staff_breakdown.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-5 py-2.5 border-b border-[#E8E0D0]/50 dark:border-zinc-800/50 last:border-0">
                <span className="text-[13px] text-[#3A342A] dark:text-zinc-300">{s.name}</span>
                <span className="text-[12px] text-[#A89B80] tabular-nums">
                  고정 {formatWon(s.base)} + 수업료 {formatWon(s.commission)} ={" "}
                  <strong className="text-[#3A342A] dark:text-zinc-200 text-[13px]">{formatWon(s.total)}원</strong>
                </span>
              </div>
            ))}
          </section>
        </>
      )}

      {/* 추가 지출 관리 */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-semibold text-[#3A342A] dark:text-zinc-200">추가 지출 관리 (월별)</span>
        <input
          type="month"
          value={expenseYm}
          onChange={(e) => setExpenseYm(e.target.value)}
          className="px-2.5 py-1 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[12.5px] text-[#2A251D] dark:text-zinc-100"
        />
      </div>
      <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-3.5 space-y-2.5">
        {/* 입력 */}
        <div className="flex flex-wrap gap-2">
          <input
            className="flex-1 min-w-[140px] px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px]"
            value={nLabel}
            onChange={(e) => setNLabel(e.target.value.slice(0, 40))}
            placeholder="내용 (예: 에어컨 수리)"
            maxLength={40}
          />
          <input
            className="w-[130px] px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px] text-right"
            value={nAmount ? formatWon(parseWon(nAmount)) : ""}
            onChange={(e) => setNAmount(e.target.value)}
            inputMode="numeric"
            placeholder="금액(원)"
          />
          <input
            className="w-[150px] px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px]"
            value={nMemo}
            onChange={(e) => setNMemo(e.target.value.slice(0, 100))}
            placeholder="메모 (선택)"
            maxLength={100}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <button
            onClick={add}
            disabled={adding || !nLabel.trim()}
            className="px-4 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932] disabled:opacity-60 whitespace-nowrap"
          >
            {adding ? "…" : "+ 추가"}
          </button>
        </div>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">{error}</div>
        )}

        {addList.length === 0 ? (
          <div className="px-4 py-6 text-center text-[12.5px] text-[#8C8270]">
            {expenseYm} 에 등록된 추가 지출이 없어요.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {addList.map((x) => (
              <li key={x.id} className="px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-800 bg-white dark:bg-zinc-950">
                {editingId === x.id ? (
                  <div className="flex flex-wrap gap-2">
                    <input
                      className="flex-1 min-w-[140px] px-3 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px]"
                      value={eLabel}
                      onChange={(e) => setELabel(e.target.value.slice(0, 40))}
                      autoFocus
                    />
                    <input
                      className="w-[120px] px-3 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px] text-right"
                      value={eAmount ? formatWon(parseWon(eAmount)) : ""}
                      onChange={(e) => setEAmount(e.target.value)}
                      inputMode="numeric"
                    />
                    <input
                      className="w-[130px] px-3 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px]"
                      value={eMemo}
                      onChange={(e) => setEMemo(e.target.value.slice(0, 100))}
                      placeholder="메모"
                    />
                    <button onClick={saveEdit} className="px-3 py-1.5 rounded-lg bg-[#6B7B3A] text-white text-[12px] font-semibold">저장</button>
                    <button onClick={() => setEditingId(null)} className="px-2 py-1.5 text-[12px] text-[#6B5D47]">취소</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <span className="text-[13px] font-medium text-[#2A251D] dark:text-zinc-100">{x.label}</span>
                      {x.memo && <span className="ml-2 text-[11.5px] text-[#8C8270]">{x.memo}</span>}
                    </div>
                    <span className="text-[13px] font-bold text-[#3A342A] dark:text-zinc-100 tabular-nums whitespace-nowrap">{formatWon(x.amount_won)}원</span>
                    <button onClick={() => startEdit(x)} className="px-2 py-1 rounded-md border border-[#E8E0D0] dark:border-zinc-700 text-[12px] text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5]">수정</button>
                    <button onClick={() => remove(x.id)} className="px-2 py-1 rounded-md border border-red-200 dark:border-red-900/60 text-[12px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30">삭제</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="text-[11.5px] text-[#A89B80] leading-relaxed">
          여기서 등록한 추가 지출은 해당 월이 정산 기간에 포함될 때 순이익에서 차감돼요.
        </div>
      </section>
    </>
  );
}

function SettleRow({
  label,
  value,
  sub,
  strong,
}: {
  label: string;
  value: number;
  sign?: string;
  sub?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-b border-[#E8E0D0]/50 dark:border-zinc-800/50">
      <div>
        <div className={`text-[13px] ${strong ? "font-semibold text-[#2A251D] dark:text-zinc-100" : "text-[#3A342A] dark:text-zinc-300"}`}>{label}</div>
        {sub && <div className="mt-0.5 text-[11px] text-[#A89B80]">{sub}</div>}
      </div>
      <span className={`text-[14px] font-semibold tabular-nums ${value < 0 ? "text-[#B47B2A] dark:text-amber-300" : "text-[#3A342A] dark:text-zinc-100"}`}>
        {formatWon(value)}원
      </span>
    </div>
  );
}

/* ─── 공통 ────────────────────────────── */

function ModeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-[12.5px] font-medium
        ${active
          ? "bg-[#6B7B3A] text-white"
          : "bg-[#FEFCF7] dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5]"
        }`}
    >
      {children}
    </button>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 -mb-px text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap
        ${active
          ? "border-[#6B7B3A] text-[#6B7B3A] dark:text-[#A8B87A]"
          : "border-transparent text-[#8C8270] dark:text-zinc-500 hover:text-[#3A342A] dark:hover:text-zinc-300"
        }`}
    >
      {children}
    </button>
  );
}

function Kpi({
  label,
  value,
  accent,
  tone,
  sub,
}: {
  label: string;
  value: string;
  accent?: boolean;
  tone?: "warn";
  sub?: string;
}) {
  const valueCls =
    tone === "warn"
      ? "text-[#B47B2A] dark:text-amber-300"
      : accent
      ? "text-[#6B7B3A] dark:text-[#A8B87A]"
      : "text-[#2A251D] dark:text-zinc-100";
  return (
    <div className="px-4 py-3.5 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
      <div className="text-[11.5px] text-[#A89B80] dark:text-zinc-500">{label}</div>
      <div className={`mt-1 text-[18px] font-bold ${valueCls}`}>{value}</div>
      {sub && (
        <div className="mt-1 text-[11px] text-[#A89B80] dark:text-zinc-500">{sub}</div>
      )}
    </div>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left font-medium px-3 py-2.5 whitespace-nowrap">{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 whitespace-nowrap ${className || ""}`}>{children}</td>;
}
