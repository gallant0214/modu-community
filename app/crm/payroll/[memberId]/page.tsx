"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/app/components/auth-provider";
import { ROLE_LABEL, formatWon, formatPhone } from "../../_components/crm-labels";
import { crmInputClass } from "../../_components/crm-modal";

type Tab = "revenue" | "members" | "sessions";
type Period = "this_month" | "last_month" | "this_year" | "custom";

interface StaffMember {
  id: number;
  display_name: string;
  role: string;
  email: string | null;
  phone: string | null;
}

export default function PayrollDetailPage() {
  const params = useParams();
  const memberId = Number(params.memberId);
  const { getIdToken } = useAuth();
  const [tab, setTab] = useState<Tab>("revenue");
  const [member, setMember] = useState<StaffMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch(`/api/crm/staff/${memberId}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setMember(data.member);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, memberId]);

  useEffect(() => {
    if (memberId) load();
  }, [memberId, load]);

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-6xl mx-auto">
      <Link
        href="/crm/payroll"
        className="inline-flex items-center gap-1 text-[13px] text-[#6B5D47] dark:text-zinc-400 hover:text-[#3A342A]"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        직원 급여 목록
      </Link>

      <header className="mt-3 mb-5">
        {loading ? (
          <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
        ) : !member ? (
          <div className="text-[13px] text-red-700">{error || "강사 정보를 찾을 수 없습니다."}</div>
        ) : (
          <>
            <h1 className="text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
              {member.display_name}
              <span className="ml-2 text-[12px] text-[#A89B80]">
                · {ROLE_LABEL[member.role] ?? member.role}
              </span>
            </h1>
            <div className="mt-1 text-[12.5px] text-[#8C8270] dark:text-zinc-500">
              {member.phone ? formatPhone(member.phone) : ""}
              {member.email && (
                <>
                  {member.phone && " · "}
                  {member.email}
                </>
              )}
            </div>
          </>
        )}
      </header>

      <div className="mb-5 flex gap-1.5 border-b border-[#E8E0D0] dark:border-zinc-800 overflow-x-auto">
        <TabBtn active={tab === "revenue"} onClick={() => setTab("revenue")}>
          매출
        </TabBtn>
        <TabBtn active={tab === "members"} onClick={() => setTab("members")}>
          담당 회원
        </TabBtn>
        <TabBtn active={tab === "sessions"} onClick={() => setTab("sessions")}>
          수업 내역
        </TabBtn>
      </div>

      {tab === "revenue" && <RevenueTab memberId={memberId} />}
      {tab === "members" && <MembersTab />}
      {tab === "sessions" && <SessionsTab />}
    </div>
  );
}

/* ─── 매출 탭 ────────────────────────────── */

function RevenueTab({ memberId }: { memberId: number }) {
  const { getIdToken } = useAuth();
  const [period, setPeriod] = useState<Period>("this_month");
  const [data, setData] = useState<{
    breakdown: { new: number; renewal: number; trial: number; service: number; total: number };
    payout: { new: number; renewal: number; trial: number; total: number };
    sessionCount: number;
    has_override: boolean;
    commission: {
      type: string;
      rate: number;
      tiers: { upTo: number | null; rate: number }[];
      effective_rate: number;
      base?: number;
      payout: number;
    };
    base_salary: number;
    bonus_payout?: number;
    achieved_bonuses?: { metric: string; gte: number; bonus_won: number }[];
    cash_pay_enabled?: boolean;
    cash_pay?: number;
    total_pay: number;
    employment_type: string | null;
    is_freelance: boolean;
    withholding_rate: number;
    withholding_tax: number;
    net_pay: number;
  } | null>(null);

  const ymForPeriod = (p: Period): string => {
    const now = new Date();
    if (p === "last_month") now.setMonth(now.getMonth() - 1);
    return now.toISOString().slice(0, 7);
  };
  const ym = ymForPeriod(period);

  useEffect(() => {
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch(`/api/crm/payroll/${memberId}?ym=${ym}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) setData(await res.json());
    })();
  }, [memberId, ym, getIdToken]);

  return (
    <>
      <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5 mb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
          <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
            전체 매출 <span className="text-[11.5px] text-[#A89B80] font-normal">(매출 적용 금액)</span>
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#A89B80]">조회 기간</span>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              className={crmInputClass}
              style={{ width: 120 }}
            >
              <option value="this_month">이번 달</option>
              <option value="last_month">지난 달</option>
              <option value="this_year">올해</option>
              <option value="custom">직접 선택</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <RevenueKpi label="매출 적용 금액" value={data?.breakdown.total ?? 0} />
          <RevenueKpi label="잔여 미수금" value={0} muted />
        </div>
      </section>

      {/* 이달 지급액 카드 */}
      <section className="rounded-2xl border-2 border-[#6B7B3A]/40 bg-[#6B7B3A]/5 dark:bg-[#6B7B3A]/10 p-4 md:p-5 mb-4">
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <h2 className="text-[14.5px] font-bold text-[#3A342A] dark:text-zinc-100">
            이달 지급액 (수업료)
          </h2>
          <a
            href={`/crm/staff/${memberId}`}
            className="text-[11.5px] text-[#6B7B3A] dark:text-[#A8B87A] hover:underline"
          >
            수업료 설정 →
          </a>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <RevenueKpi label="총 지급액" value={data?.total_pay ?? 0} />
          <RevenueKpi label="고정 급여" value={data?.base_salary ?? 0} small />
          <RevenueKpi label={`수업료 (${data?.commission.effective_rate ?? 0}%)`} value={data?.commission.payout ?? 0} small />
          {!!(data?.bonus_payout) && data.bonus_payout > 0 && (
            <RevenueKpi label={`커미션 (${data.achieved_bonuses?.length ?? 0}건 달성)`} value={data.bonus_payout} small />
          )}
          {!!(data?.cash_pay) && data.cash_pay > 0 && (
            <RevenueKpi label="현금 지급 (세금 제외)" value={data.cash_pay} small />
          )}
        </div>

        {data?.is_freelance && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <RevenueKpi label="원천징수 3.3%" value={-(data?.withholding_tax ?? 0)} small muted />
            <div className="rounded-xl border-2 border-[#6B7B3A]/50 bg-white dark:bg-zinc-900 px-3 py-2.5">
              <div className="text-[11.5px] text-[#6B7B3A] dark:text-[#A8B87A] font-medium">세후 실지급액</div>
              <div className="text-[17px] font-bold text-[#3A342A] dark:text-zinc-100 tabular-nums">
                {formatWon(data?.net_pay ?? 0)}<span className="text-[12px] font-normal ml-0.5">원</span>
              </div>
            </div>
          </div>
        )}

        <p className="mt-3 text-[11.5px] text-[#6B5D47] dark:text-zinc-400">
          고정 {formatWon(data?.base_salary ?? 0)}원 + 수업료(부가세 제외 {formatWon(data?.commission.base ?? data?.breakdown.total ?? 0)}원 × {data?.commission.effective_rate ?? 0}%)
          {!!(data?.bonus_payout) && data.bonus_payout > 0 && ` + 커미션 ${formatWon(data.bonus_payout)}원`}
          {!!(data?.cash_pay) && data.cash_pay > 0 && ` + 현금 ${formatWon(data.cash_pay)}원`}
          {" = "}
          <strong className="text-[#3A342A] dark:text-zinc-200">{formatWon(data?.total_pay ?? 0)}원</strong>
          {data?.is_freelance && (
            <>
              {" "}− 3.3% 세금 {formatWon(data?.withholding_tax ?? 0)}원 ={" "}
              <strong className="text-[#6B7B3A] dark:text-[#A8B87A]">{formatWon(data?.net_pay ?? 0)}원</strong>
              <br />
              프리랜서(사업소득)라 총 지급액에서 3.3%(소득세 3% + 지방소득세 0.3%)가 원천징수돼요.
              {!!(data?.cash_pay) && data.cash_pay > 0 && " 현금 지급액은 원천징수에서 제외됩니다."}
            </>
          )}
          {data && data.commission.effective_rate === 0 && data.base_salary === 0 && data.breakdown.total > 0 && (
            <>
              <br />
              수업료 비율과 고정 급여가 없어요. 직원 관리 → 수업료 설정에서 지정해 주세요.
            </>
          )}
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        {CATEGORIES.map((c) => (
          <div
            key={c.key}
            className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5"
          >
            <h3 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-3">
              {c.label}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <RevenueKpi label="매출 적용 금액" value={0} small />
              <RevenueKpi label="잔여 미수금" value={0} small muted />
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
            매출 내역 (0건)
          </h2>
          <select className={`${crmInputClass} ml-auto`} style={{ maxWidth: 160 }}>
            <option>전체 상품</option>
            <option>회원권</option>
            <option>그룹 수업</option>
            <option>개인 레슨</option>
            <option>락커</option>
            <option>운동 용품</option>
          </select>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[#E8E0D0] dark:border-zinc-800">
          <table className="w-full text-[13px]">
            <thead className="bg-[#FBF7EB] dark:bg-zinc-900/80 text-[#6B5D47] dark:text-zinc-400">
              <tr>
                <Th>결제일</Th>
                <Th>회원명</Th>
                <Th>연락처</Th>
                <Th>결제 상품</Th>
                <Th>결제 금액</Th>
                <Th>비고</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={6} className="px-3 py-12 text-center">
                  <div className="text-[13.5px] text-[#8C8270] dark:text-zinc-400">
                    데이터가 없어요
                  </div>
                  <div className="mt-1 text-[12px] text-[#A89B80] dark:text-zinc-500">
                    보여드릴 매출 내역이 없어요.
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

const CATEGORIES = [
  { key: "membership", label: "회원권 매출" },
  { key: "group", label: "그룹 수업 매출" },
  { key: "personal", label: "개인 레슨 매출" },
  { key: "locker", label: "락커 매출" },
  { key: "goods", label: "운동 용품 매출" },
];

function RevenueKpi({
  label,
  value,
  small,
  muted,
}: {
  label: string;
  value: number;
  small?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="px-3.5 py-2.5 rounded-xl border border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FBF7EB]/40 dark:bg-zinc-900/40">
      <div className="text-[11.5px] text-[#A89B80] dark:text-zinc-500">{label}</div>
      <div
        className={`mt-0.5 font-bold ${small ? "text-[15px]" : "text-[18px]"} ${muted ? "text-[#A89B80] dark:text-zinc-400" : "text-[#2A251D] dark:text-zinc-100"}`}
      >
        {formatWon(value)} 원
      </div>
    </div>
  );
}

/* ─── 담당 회원 탭 ────────────────────────────── */

function MembersTab() {
  return (
    <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5">
      <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-3">
        총 0명
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-2 mb-3">
        <div>
          <div className="text-[11.5px] text-[#A89B80] mb-1">필터</div>
          <select className={crmInputClass}>
            <option>회원 전체</option>
            <option>활성</option>
            <option>휴면</option>
          </select>
        </div>
        <div>
          <div className="text-[11.5px] text-[#A89B80] mb-1">검색</div>
          <input
            type="text"
            className={crmInputClass}
            placeholder="이름 및 연락처로 검색"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#E8E0D0] dark:border-zinc-800">
        <table className="w-full text-[13px]">
          <thead className="bg-[#FBF7EB] dark:bg-zinc-900/80 text-[#6B5D47] dark:text-zinc-400">
            <tr>
              <Th>번호</Th>
              <Th>이름</Th>
              <Th>PT 여부</Th>
              <Th>앱 사용</Th>
              <Th>개인 레슨 경험</Th>
              <Th>나이</Th>
              <Th>성별</Th>
              <Th>연락처</Th>
              <Th>가입일</Th>
              <Th>만기일</Th>
              <Th>최근 구매 상품</Th>
              <Th>총 결제 금액</Th>
              <Th>총 미수금</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={13} className="px-3 py-12 text-center">
                <div className="text-[13.5px] text-[#8C8270] dark:text-zinc-400">
                  데이터가 없어요
                </div>
                <div className="mt-1 text-[12px] text-[#A89B80] dark:text-zinc-500">
                  아직 담당 회원이 없어요.
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ─── 수업 내역 탭 ────────────────────────────── */

type SessionKind = "personal" | "group";

function SessionsTab() {
  const [kind, setKind] = useState<SessionKind>("personal");
  const [period, setPeriod] = useState<Period>("this_month");

  return (
    <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5">
      <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-3">
        수업 내역
      </h2>

      <div className="flex gap-1.5 mb-4 border-b border-[#E8E0D0]/60 dark:border-zinc-800">
        {[
          { key: "personal" as const, label: "개인 레슨" },
          { key: "group" as const, label: "그룹 수업" },
        ].map((k) => (
          <button
            key={k.key}
            onClick={() => setKind(k.key)}
            className={`px-3 py-1.5 -mb-px text-[12.5px] font-medium border-b-2 transition-colors
              ${kind === k.key
                ? "border-[#6B7B3A] text-[#6B7B3A] dark:text-[#A8B87A]"
                : "border-transparent text-[#8C8270] hover:text-[#3A342A]"
              }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">
          총 수업 횟수 (0회)
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11.5px] text-[#A89B80]">필터</span>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className={crmInputClass}
            style={{ width: 120 }}
          >
            <option value="this_month">이번 달</option>
            <option value="last_month">지난 달</option>
            <option value="this_year">올해</option>
            <option value="custom">직접 선택</option>
          </select>
          <select className={crmInputClass} style={{ width: 130 }}>
            <option>{kind === "personal" ? "개인 레슨 전체" : "그룹 수업 전체"}</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#E8E0D0] dark:border-zinc-800">
        <table className="w-full text-[13px]">
          <thead className="bg-[#FBF7EB] dark:bg-zinc-900/80 text-[#6B5D47] dark:text-zinc-400">
            <tr>
              <Th>번호</Th>
              <Th>이름</Th>
              <Th>나이</Th>
              <Th>성별</Th>
              <Th>연락처</Th>
              <Th>상품명</Th>
              <Th>계약 수 + 서비스 수 (총 계약)</Th>
              <Th>사용 완료</Th>
              <Th>잔여</Th>
              <Th>수업 횟수</Th>
              <Th>세부사항</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={11} className="px-3 py-12 text-center">
                <div className="text-[13.5px] text-[#8C8270] dark:text-zinc-400">
                  데이터가 없어요
                </div>
                <div className="mt-1 text-[12px] text-[#A89B80] dark:text-zinc-500">
                  수업 내역이 존재하지 않아요.
                  <br />
                  필터를 다시 설정해 보세요.
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-center gap-3 text-[12.5px] text-[#3A342A] dark:text-zinc-300">
        <span className="font-medium">1</span>
      </div>
    </section>
  );
}

/* ─── 공통 ────────────────────────────── */

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

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left font-medium px-3 py-2.5 whitespace-nowrap">{children}</th>;
}
