"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { formatPhone } from "../_components/crm-labels";
import { CONSULT_STATUS_COLOR, CONSULT_STATUS_LABEL } from "./_labels";

interface Row {
  id: number;
  member_id: number | null;
  name: string;
  gender: string | null;
  birth: string | null;
  phone: string | null;
  address_dong: string | null;
  trainer_member_id: number | null;
  trainer_name: string | null;
  goals: string[] | null;
  status: string;
  converted_at: string | null;
  converted_pass_id: number | null;
  consulted_at: string;
}

interface Stats {
  total: { total: number; converted: number; lost: number; open: number };
  conversion_rate: number;
  by_trainer: {
    trainer_member_id: number | null;
    trainer_name: string;
    total: number;
    converted: number;
    lost: number;
    open: number;
    conversion_rate: number;
  }[];
}

export default function ConsultationsPage() {
  const { getIdToken } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const [listRes, statsRes] = await Promise.all([
        fetch(
          `/api/crm/consultations?limit=500${statusFilter ? `&status=${statusFilter}` : ""}${
            query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ""
          }`,
          { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }
        ),
        fetch(`/api/crm/consultations/stats`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
      ]);
      const listData = await listRes.json();
      const statsData = await statsRes.json();
      if (!listRes.ok) throw new Error(listData?.error || "조회 실패");
      if (!statsRes.ok) throw new Error(statsData?.error || "통계 조회 실패");
      setRows(listData.consultations ?? []);
      setStats(statsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, statusFilter, query]);

  useEffect(() => {
    load();
  }, [load]);

  const total = stats?.total.total ?? 0;

  return (
    <div className="px-5 md:px-8 pt-3 pb-8 max-w-6xl mx-auto space-y-5">
      <header>
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
              PT 상담
            </h1>
            <p className="mt-1 text-[12.5px] text-[#8C8270] dark:text-zinc-500">
              종이 상담지를 대체 · 상담 → PT 등록 전환률을 자동 집계합니다.
            </p>
          </div>
        </div>

        {/* 상단 CTA: 새 상담지 만들기 */}
        <Link
          href="/crm/consultations/new"
          className="mt-3 flex items-center justify-between gap-3 px-4 md:px-5 py-3.5 rounded-2xl border-2 border-dashed border-[#6B7B3A]/60 bg-gradient-to-r from-[#F3F7EA] to-white dark:from-emerald-950/20 dark:to-zinc-900 hover:border-[#6B7B3A] hover:bg-[#EFE7D5]/50 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-[#6B7B3A] text-white text-[18px] font-bold">
              +
            </span>
            <div className="min-w-0">
              <div className="text-[14.5px] font-bold text-[#2A251D] dark:text-zinc-100">
                피티 상담지 만들기
              </div>
              <div className="text-[11.5px] text-[#6B5D47] dark:text-zinc-400 truncate">
                센터 회원 검색 또는 방문객 정보 입력 → 스페셜바디 상담지 항목 그대로 기록
              </div>
            </div>
          </div>
          <span className="shrink-0 text-[13px] font-semibold text-[#6B7B3A]">시작 →</span>
        </Link>
      </header>

      {/* 요약 KPI */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <KpiTile label="전체 상담" value={total} suffix="건" />
        <KpiTile
          label="PT 등록 전환"
          value={stats?.total.converted ?? 0}
          suffix="건"
          tone="green"
        />
        <KpiTile label="미등록" value={stats?.total.lost ?? 0} suffix="건" />
        <KpiTile
          label="전환률"
          value={stats?.conversion_rate ?? 0}
          suffix="%"
          tone="green"
          isRate
        />
      </section>

      {/* 담당 강사별 전환률 */}
      {(stats?.by_trainer.length ?? 0) > 0 && (
        <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4">
          <h2 className="text-[13.5px] font-bold text-[#2A251D] dark:text-zinc-100 mb-2.5">
            담당 강사별 전환률
          </h2>
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="w-full text-[12.5px]">
              <thead className="text-[#8C8270] dark:text-zinc-500 border-b border-[#E8E0D0] dark:border-zinc-800">
                <tr>
                  <th className="text-left py-1.5 pr-2 font-semibold">강사</th>
                  <th className="text-right py-1.5 px-2 font-semibold">상담</th>
                  <th className="text-right py-1.5 px-2 font-semibold">PT 등록</th>
                  <th className="text-right py-1.5 px-2 font-semibold">미등록</th>
                  <th className="text-right py-1.5 px-2 font-semibold">진행중</th>
                  <th className="text-right py-1.5 pl-2 font-semibold">전환률</th>
                </tr>
              </thead>
              <tbody className="text-[#2A251D] dark:text-zinc-200">
                {stats?.by_trainer.map((t) => (
                  <tr
                    key={t.trainer_member_id ?? 0}
                    className="border-b border-[#E8E0D0]/60 dark:border-zinc-800/70 last:border-b-0"
                  >
                    <td className="py-2 pr-2 font-semibold">{t.trainer_name}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{t.total}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                      {t.converted}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-[#8C8270]">{t.lost}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-amber-700 dark:text-amber-300">
                      {t.open}
                    </td>
                    <td className="py-2 pl-2 text-right tabular-nums font-bold text-[#6B7B3A] dark:text-[#A8B87A]">
                      {t.conversion_rate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 필터 + 목록 */}
      <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="flex gap-1.5">
            {(
              [
                { v: "", l: "전체" },
                { v: "open", l: "진행중" },
                { v: "converted", l: "PT 등록" },
                { v: "lost", l: "미등록" },
              ] as const
            ).map((f) => (
              <button
                key={f.v}
                type="button"
                onClick={() => setStatusFilter(f.v)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors ${
                  statusFilter === f.v
                    ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
                    : "border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[#3A342A] dark:text-zinc-300"
                }`}
              >
                {f.l}
              </button>
            ))}
          </div>
          <div className="flex-1 min-w-[180px]">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름 · 연락처 검색"
              className="w-full h-9 px-3 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px] focus:outline-none focus:border-[#6B7B3A]"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-10 text-[13px] text-[#8C8270]">불러오는 중…</div>
        ) : error ? (
          <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
            {error}
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-10 text-[13px] text-[#8C8270]">
            상담 기록이 없습니다.
          </div>
        ) : (
          <ConsultationList rows={rows} />
        )}
      </section>
    </div>
  );
}

function ConsultationList({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-x-auto -mx-2 px-2">
      <table className="w-full text-[13px]">
        <thead className="text-[#8C8270] dark:text-zinc-500 border-b border-[#E8E0D0] dark:border-zinc-800">
          <tr>
            <th className="text-left py-2 pr-2 font-semibold">상담일</th>
            <th className="text-left py-2 pr-2 font-semibold">이름</th>
            <th className="text-left py-2 pr-2 font-semibold">연락처</th>
            <th className="text-left py-2 pr-2 font-semibold">담당 강사</th>
            <th className="text-left py-2 pr-2 font-semibold">회원</th>
            <th className="text-left py-2 font-semibold">상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-b border-[#E8E0D0]/60 dark:border-zinc-800/70 last:border-b-0"
            >
              <td className="py-2 pr-2 tabular-nums text-[#6B5D47]">{r.consulted_at}</td>
              <td className="py-2 pr-2 font-semibold text-[#2A251D] dark:text-zinc-100">
                <Link
                  href={`/crm/consultations/${r.id}`}
                  className="hover:underline"
                >
                  {r.name}
                </Link>
              </td>
              <td className="py-2 pr-2 text-[#6B5D47]">
                {r.phone ? formatPhone(r.phone) : "—"}
              </td>
              <td className="py-2 pr-2 text-[#6B5D47]">{r.trainer_name ?? "미지정"}</td>
              <td className="py-2 pr-2">
                {r.member_id ? (
                  <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-[#F3F7EA] text-[#4D622C] border border-[#DDE8C5]">
                    센터 회원
                  </span>
                ) : (
                  <span className="text-[11.5px] text-[#A89B80]">방문객</span>
                )}
              </td>
              <td className="py-2">
                <StatusChip status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const cls = CONSULT_STATUS_COLOR[status] ?? "bg-zinc-100 text-zinc-700";
  return (
    <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${cls}`}>
      {CONSULT_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function KpiTile({
  label,
  value,
  suffix,
  tone,
  isRate,
}: {
  label: string;
  value: number;
  suffix: string;
  tone?: "green";
  isRate?: boolean;
}) {
  const cls =
    tone === "green"
      ? "border-[#DDE8C5] bg-[#F3F7EA]/70 text-[#4D622C]"
      : "border-[#E8E0D0] bg-white text-[#2A251D]";
  return (
    <div className={`rounded-xl border p-3 dark:bg-zinc-900 dark:border-zinc-800 ${cls}`}>
      <div className="text-[11px] font-semibold opacity-70">{label}</div>
      <div className="mt-1 text-[22px] font-bold tabular-nums dark:text-zinc-100">
        {isRate ? value.toFixed(1) : value.toLocaleString()}
        <span className="ml-1 text-[12px] font-semibold opacity-70">{suffix}</span>
      </div>
    </div>
  );
}
