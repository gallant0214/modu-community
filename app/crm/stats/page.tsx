"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/auth-provider";
import { ROLE_LABEL, formatWon } from "../_components/crm-labels";

interface MonthlyResp {
  ym: string;
  summary: {
    newMembers: number;
    memberCount: number;
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

type Tab = "trainer" | "center";

type DateMode = "month" | "range";

export default function CrmStatsPage() {
  const { getIdToken } = useAuth();
  const [tab, setTab] = useState<Tab>("trainer");
  const [dateMode, setDateMode] = useState<DateMode>("month");
  const [ym, setYm] = useState(() => new Date().toISOString().slice(0, 7));
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<MonthlyResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // API 쿼리 문자열 (탭 공용)
  const rangeQs =
    dateMode === "range" && from && to && to >= from ? `from=${from}&to=${to}` : `ym=${ym}`;

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

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-6xl mx-auto">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
            통계
          </h1>
          <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
            {tab === "trainer"
              ? "강사별 매출과 수업 현황을 확인해요."
              : "센터 매출(회원권·운동복·락커·기타)을 확인해요."}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-[#E8E0D0] dark:border-zinc-700 overflow-hidden">
            <ModeBtn active={dateMode === "month"} onClick={() => setDateMode("month")}>
              월별
            </ModeBtn>
            <ModeBtn active={dateMode === "range"} onClick={() => setDateMode("range")}>
              직접 선택
            </ModeBtn>
          </div>
          {dateMode === "month" ? (
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
        </div>
      </header>

      <div className="mb-5 flex gap-1.5 border-b border-[#E8E0D0] dark:border-zinc-800">
        <TabBtn active={tab === "trainer"} onClick={() => setTab("trainer")}>
          강사 매출
        </TabBtn>
        <TabBtn active={tab === "center"} onClick={() => setTab("center")}>
          센터 매출
        </TabBtn>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : tab === "trainer" ? (
        <TrainerTab data={data} />
      ) : (
        <CenterTab rangeQs={rangeQs} />
      )}
    </div>
  );
}

/* ─── 강사 매출 탭 ────────────────────────────── */

function TrainerTab({ data }: { data: MonthlyResp | null }) {
  if (!data) return null;
  return (
    <>
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Kpi label="등록 회원수" value={`${data.summary.newMembers}명`} />
        <Kpi label="PT매출" value={`${formatWon(data.summary.totalRevenue)}원`} accent />
        <Kpi label="수강권 발급" value={`${data.summary.totalPassCount}건`} />
        <Kpi
          label="활동 강사"
          value={`${data.trainers.filter((t) => t.passes.total > 0 || t.reservations.attended > 0).length}명`}
        />
      </section>

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
                  <Td className="text-[#A89B80]">{t.reservations.cancelled}회</Td>
                  <Td className="text-red-600 dark:text-red-400">{t.reservations.noshow}회</Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}

/* ─── 센터 매출 탭 ────────────────────────────── */

interface CenterRevenueResp {
  ym: string;
  total: number;
  counts: { memberships: number; passes: number };
  categories: {
    membership: number;
    pass: number;
    locker: number;
    goods: number;
    etc: number;
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
    { key: "membership", label: "회원권 매출", href: "/crm/memberships" },
    { key: "pass", label: "수강권 매출", href: "/crm/passes" },
    { key: "goods", label: "운동 용품 매출" },
    { key: "locker", label: "락커 매출", href: "/crm/lockers" },
    { key: "etc", label: "기타 판매 매출" },
  ];

  if (loading) {
    return <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>;
  }

  return (
    <>
      <section className="grid grid-cols-2 md:grid-cols-2 gap-3 mb-5">
        <Kpi label="센터 매출 합계" value={`${formatWon(data?.total ?? 0)}원`} accent />
        <Kpi
          label="이번달 활동"
          value={`${(data?.counts.memberships ?? 0) + (data?.counts.passes ?? 0)}건`}
        />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {cats.map((c) => {
          const v = data?.categories[c.key] ?? 0;
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
    </>
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

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="px-4 py-3.5 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
      <div className="text-[11.5px] text-[#A89B80] dark:text-zinc-500">{label}</div>
      <div className={`mt-1 text-[18px] font-bold ${accent ? "text-[#6B7B3A] dark:text-[#A8B87A]" : "text-[#2A251D] dark:text-zinc-100"}`}>
        {value}
      </div>
    </div>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left font-medium px-3 py-2.5 whitespace-nowrap">{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 whitespace-nowrap ${className || ""}`}>{children}</td>;
}
