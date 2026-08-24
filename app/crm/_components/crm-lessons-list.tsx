"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/auth-provider";
import { formatPhone, RESERVATION_STATUS_LABEL } from "./crm-labels";

/**
 * 수업진행목록 — 센터에서 '진행된 수업'(출석·노쇼) 목록을 기간·강사별로 조회.
 * (원래 통계 탭에 있었으나 스케줄 관리로 이동)
 */
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

export function CrmLessonsList() {
  const { getIdToken } = useAuth();
  const now = new Date();
  // 기본값: 이번 달 1일 ~ 말일 (달에 따라 28/29/30/31 자동)
  const [from, setFrom] = useState(() => localYmd(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(() => localYmd(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
  const [trainerId, setTrainerId] = useState<number | "">("");
  const [statusFilter, setStatusFilter] = useState<"all" | "attended" | "noshow">("all"); // 상태 필터(기본 전체)
  const [memberQuery, setMemberQuery] = useState(""); // 회원명/연락처 검색(클라이언트)
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

  // 상태 + 회원명 필터(클라이언트) — 조회한 목록에서 출석/노쇼·회원명으로 좁혀 보기
  const mq = memberQuery.trim().toLowerCase();
  const mqDigits = mq.replace(/\D/g, "");
  const filteredRows = rows
    .filter((r) => statusFilter === "all" || r.status === statusFilter)
    .filter(
      (r) =>
        !mq ||
        r.member_name.toLowerCase().includes(mq) ||
        (mqDigits.length > 0 && (r.member_phone ?? "").replace(/\D/g, "").includes(mqDigits))
    );

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
        <label className="flex flex-col gap-1 text-[11.5px] text-[#8C8270]">
          상태
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "attended" | "noshow")}
            className={inputCls}
          >
            <option value="all">전체</option>
            <option value="attended">출석</option>
            <option value="noshow">노쇼</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] text-[#8C8270]">
          회원 검색
          <input
            type="text"
            value={memberQuery}
            onChange={(e) => setMemberQuery(e.target.value)}
            placeholder="회원명 또는 연락처"
            className={`${inputCls} min-w-[160px]`}
          />
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
      ) : filteredRows.length === 0 ? (
        <div className="px-4 py-10 text-center text-[13px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
          {rows.length === 0
            ? "해당 기간에 진행된 수업이 없어요."
            : mq
              ? `'${memberQuery.trim()}' 회원의 수업이 없어요.`
              : `해당 기간에 '${statusFilter === "attended" ? "출석" : "노쇼"}' 수업이 없어요.`}
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
              {filteredRows.map((r) => (
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
