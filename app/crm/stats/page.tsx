"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { ROLE_LABEL } from "../_components/crm-labels";

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

export default function CrmStatsPage() {
  const { getIdToken } = useAuth();
  const [ym, setYm] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<MonthlyResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch(`/api/crm/stats/monthly?ym=${ym}`, {
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
  }, [getIdToken, ym]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="px-5 md:px-8 py-6 md:py-8 max-w-6xl mx-auto">
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
            기간별 통계
          </h1>
          <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
            강사별 매출과 수업 현황을 한 달 단위로 확인해요.
          </p>
        </div>
        <input
          type="month"
          value={ym}
          onChange={(e) => setYm(e.target.value)}
          className="ml-auto px-3 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[13px] text-[#2A251D] dark:text-zinc-100"
        />
      </header>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : data ? (
        <>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <Kpi label="등록 회원수" value={`${data.summary.newMembers}명`} />
            <Kpi label="PT매출" value={`${data.summary.totalRevenue.toLocaleString()}원`} accent />
            <Kpi label="수강권" value={`${data.summary.totalPassCount}건`} />
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
                    <tr key={t.trainerMemberId} className="border-t border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
                      <Td>
                        <span className="font-semibold text-[#2A251D] dark:text-zinc-100">{t.name}</span>
                      </Td>
                      <Td className="text-[#8C8270]">{ROLE_LABEL[t.role] ?? t.role}</Td>
                      <Td>{t.passes.new}건</Td>
                      <Td>{t.passes.renewal}건</Td>
                      <Td>{t.passes.trial}건</Td>
                      <Td className="font-semibold">{t.passes.revenue.toLocaleString()}원</Td>
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
      ) : null}
    </div>
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
