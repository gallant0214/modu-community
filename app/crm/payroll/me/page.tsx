"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/auth-provider";
import { formatWon, formatPhone } from "../../_components/crm-labels";
import { crmInputClass } from "../../_components/crm-modal";

/* ---------- 타입 ---------- */

type Tab = "revenue" | "members" | "sessions";
type Period = "this_month" | "last_month" | "this_year" | "custom";

interface MyCenter {
  centerMemberId: number;
  centerId: number;
  centerName: string;
  centerKind: string;
  region: string | null;
  address: string | null;
  role: string;
  isSoloOwner: boolean;
  status: string;
  accessAllowed: boolean;
}

interface CenterProfile {
  id: number;
  name: string;
  kind: string;
  region_sido: string | null;
  region_sigungu: string | null;
  address: string | null;
  phone: string | null;
  naver_url: string | null;
  google_url: string | null;
  instagram_id: string | null;
  youtube_url: string | null;
  status: string;
}

interface Payroll {
  ym: string;
  passes: {
    id: number;
    issue_type: string;
    price_won: number;
    total_sessions: number;
    issued_at: string;
    status: string;
    vat_included: boolean;
  }[];
  breakdown: { new: number; renewal: number; trial: number; service: number; total: number };
  payout: { new: number; renewal: number; trial: number; total: number };
  sessionCount: number;
  commission: {
    type: string;
    rate: number;
    tiers: { upTo: number | null; rate: number }[];
    effective_rate: number;
    base: number;
    payout: number;
  };
  base_salary: number;
  achieved_bonuses: { metric: string; gte: number; reward_type?: string; bonus_won?: number; bonus_percent?: number }[];
  bonus_payout: number;
  cash_pay_enabled: boolean;
  cash_pay: number;
  total_pay: number;
  employment_type: string | null;
  is_freelance: boolean;
  withholding_rate: number;
  withholding_tax: number;
  net_pay: number;
}

interface MemberRow {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  birth: string | null;
  gender: string | null;
  registered_at: string | null;
  final_expire_at: string | null;
  total_paid_won: number;
  last_purchase_at: string | null;
  last_attended_at: string | null;
}

interface SessionRow {
  id: number;
  member_name: string;
  age: number | null;
  gender: string | null;
  phone: string | null;
  product: string;
  total: number;
  used: number;
  remaining: number;
  per_session_won: number;
}

/* ---------- 기간 헬퍼 ---------- */

const monthStart = (d = new Date()) => `${d.toISOString().slice(0, 7)}-01`;
const monthEnd = (d = new Date()) => {
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return next.toISOString().slice(0, 10);
};
const lastMonthRange = () => {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
};
const thisYearRange = () => {
  const y = new Date().getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
};
const rangeForPreset = (p: Period): { from: string; to: string } | null => {
  if (p === "this_month") return { from: monthStart(), to: monthEnd() };
  if (p === "last_month") return lastMonthRange();
  if (p === "this_year") return thisYearRange();
  return null;
};

/* ---------- 페이지 ---------- */

export default function MyPayrollPage() {
  const { getIdToken } = useAuth();
  const [centers, setCenters] = useState<MyCenter[]>([]);
  const [pickedCenterId, setPickedCenterId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("revenue");
  const [loadingCenters, setLoadingCenters] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        const res = await fetch("/api/crm/centers/mine", {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "센터 목록 조회 실패");
        const list = ((data.centers ?? []) as MyCenter[]).filter(
          (c) => c.status === "active" && c.accessAllowed
        );
        setCenters(list);
        if (list.length > 0) setPickedCenterId(list[0].centerId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "네트워크 오류");
      } finally {
        setLoadingCenters(false);
      }
    })();
  }, [getIdToken]);

  const picked = useMemo(
    () => centers.find((c) => c.centerId === pickedCenterId) ?? null,
    [centers, pickedCenterId]
  );

  return (
    <div className="px-5 md:px-8 pt-3 pb-8 max-w-6xl mx-auto">
      <header className="mb-4">
        <h1 className="text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">내 급여</h1>
        <p className="mt-1 text-[12.5px] text-[#8C8270] dark:text-zinc-500">
          센터별로 발급 매출·수업 내역·담당 회원과 급여 지급액을 확인할 수 있어요.
        </p>
      </header>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loadingCenters ? (
        <div className="py-12 text-center text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : centers.length === 0 ? (
        <div className="py-12 text-center text-[13px] text-[#8C8270]">
          소속된 센터가 없어요.
        </div>
      ) : (
        <>
          {centers.length > 1 && (
            <div className="mb-4 flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] text-[#8C8270] dark:text-zinc-500 mr-1">센터 선택</span>
              {centers.map((c) => (
                <button
                  key={c.centerId}
                  onClick={() => setPickedCenterId(c.centerId)}
                  className={`px-3 py-1.5 rounded-lg text-[12.5px] font-semibold border transition-colors ${
                    pickedCenterId === c.centerId
                      ? "border-[#6B7B3A] bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A]"
                      : "border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300"
                  }`}
                >
                  {c.centerName}
                  {c.isSoloOwner && (
                    <span className="ml-1 text-[10px] text-[#A89B80]">(개인)</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {picked && (
            <>
              <CenterInfoCard centerId={picked.centerId} />

              <div className="mt-4 mb-4 flex gap-1.5 border-b border-[#E8E0D0] dark:border-zinc-800 overflow-x-auto">
                <TabBtn active={tab === "revenue"} onClick={() => setTab("revenue")}>
                  매출 · 급여
                </TabBtn>
                <TabBtn active={tab === "members"} onClick={() => setTab("members")}>
                  담당 회원
                </TabBtn>
                <TabBtn active={tab === "sessions"} onClick={() => setTab("sessions")}>
                  수업 내역
                </TabBtn>
              </div>

              {tab === "revenue" && (
                <RevenueTab centerId={picked.centerId} centerMemberId={picked.centerMemberId} />
              )}
              {tab === "members" && <MembersTab centerId={picked.centerId} />}
              {tab === "sessions" && (
                <SessionsTab centerId={picked.centerId} centerMemberId={picked.centerMemberId} />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- 센터 정보 카드 ---------- */

function CenterInfoCard({ centerId }: { centerId: number }) {
  const { getIdToken } = useAuth();
  const [center, setCenter] = useState<CenterProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const token = await getIdToken();
        if (!token) return;
        const res = await fetch(`/api/crm/centers/me?centerId=${centerId}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (res.ok) {
          const d = await res.json();
          setCenter(d.center);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [centerId, getIdToken]);

  return (
    <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5">
      <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-3">
        센터 정보
      </h2>
      {loading || !center ? (
        <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
          <InfoRow label="센터명" value={center.name} />
          <InfoRow
            label="지역"
            value={[center.region_sido, center.region_sigungu].filter(Boolean).join(" ") || "—"}
          />
          <InfoRow label="주소" value={center.address || "—"} />
          <InfoRow label="전화" value={center.phone ? formatPhone(center.phone) : "—"} />
          {center.naver_url && (
            <InfoRow
              label="네이버"
              value={
                <a
                  href={center.naver_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#6B7B3A] hover:underline break-all"
                >
                  {center.naver_url}
                </a>
              }
            />
          )}
          {center.instagram_id && (
            <InfoRow
              label="인스타"
              value={
                <a
                  href={`https://instagram.com/${center.instagram_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#6B7B3A] hover:underline"
                >
                  @{center.instagram_id}
                </a>
              }
            />
          )}
        </div>
      )}
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="min-w-[54px] text-[11.5px] text-[#A89B80]">{label}</span>
      <span className="text-[13px] text-[#2A251D] dark:text-zinc-200">{value}</span>
    </div>
  );
}

/* ---------- 매출·급여 탭 ---------- */

function RevenueTab({ centerId, centerMemberId }: { centerId: number; centerMemberId: number }) {
  const { getIdToken } = useAuth();
  const [preset, setPreset] = useState<Period>("this_month");
  const [customFrom, setCustomFrom] = useState(monthStart());
  const [customTo, setCustomTo] = useState(monthEnd());
  const [data, setData] = useState<Payroll | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const range = useMemo(() => {
    if (preset === "custom") return { from: customFrom, to: customTo };
    return rangeForPreset(preset) ?? { from: monthStart(), to: monthEnd() };
  }, [preset, customFrom, customTo]);

  useEffect(() => {
    setLoading(true);
    setErr("");
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        const q = new URLSearchParams({ centerId: String(centerId), from: range.from, to: range.to });
        const res = await fetch(`/api/crm/payroll/${centerMemberId}?${q}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d?.error || "조회 실패");
        setData(d);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "네트워크 오류");
      } finally {
        setLoading(false);
      }
    })();
  }, [centerId, centerMemberId, range.from, range.to, getIdToken]);

  if (err) {
    return <div className="mt-4 text-[13px] text-red-700">{err}</div>;
  }
  if (loading || !data) {
    return <div className="py-8 text-center text-[13px] text-[#8C8270]">불러오는 중…</div>;
  }

  return (
    <>
      <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5 mb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
          <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
            매출 <span className="text-[11.5px] text-[#A89B80] font-normal">(발급 기준)</span>
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <PeriodBtn label="이번 달" active={preset === "this_month"} onClick={() => setPreset("this_month")} />
            <PeriodBtn label="지난 달" active={preset === "last_month"} onClick={() => setPreset("last_month")} />
            <PeriodBtn label="올해" active={preset === "this_year"} onClick={() => setPreset("this_year")} />
            <PeriodBtn label="기간 지정" active={preset === "custom"} onClick={() => setPreset("custom")} />
            {preset === "custom" && (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className={`${crmInputClass} w-[140px]`}
                />
                <span className="text-[12px] text-[#A89B80]">~</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className={`${crmInputClass} w-[140px]`}
                />
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <RevenueKpi label="발급 매출" value={data.breakdown.total} />
          <RevenueKpi label="세션 수" value={data.sessionCount} unit="회" />
          <RevenueKpi label="신규" value={data.breakdown.new} small />
          <RevenueKpi label="재등록" value={data.breakdown.renewal} small />
        </div>
      </section>

      <section className="rounded-2xl border-2 border-[#6B7B3A]/40 bg-[#6B7B3A]/5 dark:bg-[#6B7B3A]/10 p-4 md:p-5 mb-4">
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <h2 className="text-[14.5px] font-bold text-[#3A342A] dark:text-zinc-100">이 기간 지급액</h2>
          <span className="text-[11.5px] text-[#6B7B3A] dark:text-[#A8B87A]">
            {range.from} ~ {range.to}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <RevenueKpi label="총 지급액" value={data.total_pay} />
          <RevenueKpi label="고정 급여" value={data.base_salary} small />
          <RevenueKpi label={`수업료 (${data.commission.effective_rate}%)`} value={data.commission.payout} small />
          {data.bonus_payout > 0 && (
            <RevenueKpi label={`성과급 (${data.achieved_bonuses.length}건 달성)`} value={data.bonus_payout} small />
          )}
          {data.cash_pay > 0 && (
            <RevenueKpi label="현금 지급 (세금 제외)" value={data.cash_pay} small />
          )}
        </div>

        {data.is_freelance && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <RevenueKpi label="원천징수 3.3%" value={-data.withholding_tax} small muted />
            <div className="rounded-xl border-2 border-[#6B7B3A]/50 bg-white dark:bg-zinc-900 px-3 py-2.5">
              <div className="text-[11.5px] text-[#6B7B3A] dark:text-[#A8B87A] font-medium">세후 실지급액</div>
              <div className="text-[17px] font-bold text-[#3A342A] dark:text-zinc-100 tabular-nums">
                {formatWon(data.net_pay)}
                <span className="text-[12px] font-normal ml-0.5">원</span>
              </div>
            </div>
          </div>
        )}

        <p className="mt-3 text-[11.5px] text-[#6B5D47] dark:text-zinc-400">
          고정 {formatWon(data.base_salary)}원 + 수업료(부가세 제외 {formatWon(data.commission.base)}원 × {data.commission.effective_rate}%)
          {data.bonus_payout > 0 && ` + 성과급 ${formatWon(data.bonus_payout)}원`}
          {data.cash_pay > 0 && ` + 현금 ${formatWon(data.cash_pay)}원`}
          {" = "}
          <strong className="text-[#3A342A] dark:text-zinc-200">{formatWon(data.total_pay)}원</strong>
          {data.is_freelance && (
            <>
              {" "}− 3.3% 세금 {formatWon(data.withholding_tax)}원 ={" "}
              <strong className="text-[#6B7B3A] dark:text-[#A8B87A]">{formatWon(data.net_pay)}원</strong>
            </>
          )}
        </p>
      </section>

      <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5">
        <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-3">
          발급 수강권 ({data.passes.length}건)
        </h2>
        {data.passes.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-[#8C8270]">
            이 기간에 발급된 수강권이 없어요.
          </div>
        ) : (
          <div className="divide-y divide-[#E8E0D0] dark:divide-zinc-800 text-[13px]">
            {data.passes.map((p) => (
              <div key={p.id} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[12.5px] text-[#3A342A] dark:text-zinc-300">
                    발급 {p.issued_at.slice(0, 10)} · {p.total_sessions}회
                    <span className="ml-2 text-[11px] text-[#A89B80]">
                      {issueTypeLabel(p.issue_type)}
                    </span>
                  </div>
                </div>
                <div className="text-[13px] font-semibold text-[#2A251D] dark:text-zinc-100">
                  {formatWon(p.price_won)}원
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

/* ---------- 담당 회원 탭 ---------- */

function MembersTab({ centerId }: { centerId: number }) {
  const { getIdToken } = useAuth();
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        const q = new URLSearchParams({ centerId: String(centerId), detail: "1", limit: "500" });
        const res = await fetch(`/api/crm/members?${q}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (res.ok) {
          const d = await res.json();
          setRows((d.members ?? []) as MemberRow[]);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [centerId, getIdToken]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.phone && r.phone.includes(q)) ||
        (r.email && r.email.toLowerCase().includes(q))
    );
  }, [rows, query]);

  return (
    <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
        <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
          담당 회원 ({filtered.length}명)
        </h2>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름·연락처·이메일 검색"
          className={`${crmInputClass} w-full md:w-[240px]`}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#E8E0D0] dark:border-zinc-800">
        <table className="w-full text-[13px]">
          <thead className="bg-[#FBF7EB] dark:bg-zinc-900/80 text-[#6B5D47] dark:text-zinc-400">
            <tr>
              <Th>이름</Th>
              <Th>연락처</Th>
              <Th>이메일</Th>
              <Th>가입일</Th>
              <Th>최종 만료</Th>
              <Th>누적 결제</Th>
              <Th>마지막 출석</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-[13px] text-[#8C8270]">
                  불러오는 중…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-[13px] text-[#8C8270]">
                  담당 회원이 없어요.
                </td>
              </tr>
            ) : (
              filtered.map((m) => (
                <tr
                  key={m.id}
                  className="border-t border-[#E8E0D0]/70 dark:border-zinc-800 hover:bg-[#FBF7EB]/40 dark:hover:bg-zinc-800/40"
                >
                  <td className="px-3 py-2.5 font-medium text-[#2A251D] dark:text-zinc-100 whitespace-nowrap">
                    <Link href={`/crm/members/${m.id}`} className="hover:text-[#6B7B3A]">
                      {m.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-[#6B5D47] dark:text-zinc-400 whitespace-nowrap">
                    {m.phone ? formatPhone(m.phone) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-[#6B5D47] dark:text-zinc-400 whitespace-nowrap">
                    {m.email || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-[#6B5D47] dark:text-zinc-400 whitespace-nowrap">
                    {m.registered_at ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-[#6B5D47] dark:text-zinc-400 whitespace-nowrap">
                    {formatExpiry(m.final_expire_at)}
                  </td>
                  <td className="px-3 py-2.5 text-[#3A342A] dark:text-zinc-200 whitespace-nowrap tabular-nums">
                    {formatWon(m.total_paid_won)}원
                  </td>
                  <td className="px-3 py-2.5 text-[#6B5D47] dark:text-zinc-400 whitespace-nowrap">
                    {m.last_attended_at ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------- 수업 내역 탭 ---------- */

function SessionsTab({ centerId, centerMemberId }: { centerId: number; centerMemberId: number }) {
  const { getIdToken } = useAuth();
  const [period, setPeriod] = useState<Period>("this_month");
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [totalSessions, setTotalSessions] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        const q = new URLSearchParams({ centerId: String(centerId), period });
        const res = await fetch(`/api/crm/payroll/${centerMemberId}/sessions?${q}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (res.ok) {
          const d = await res.json();
          setRows((d.sessions ?? []) as SessionRow[]);
          setTotalSessions(d.total_sessions ?? 0);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [centerId, centerMemberId, period, getIdToken]);

  const genderLabel = (g: string | null) => (g === "M" ? "남" : g === "F" ? "여" : "-");

  return (
    <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
          수업 내역 (총 {totalSessions}회)
        </h2>
        <div className="ml-auto flex items-center gap-1.5">
          <PeriodBtn label="이번 달" active={period === "this_month"} onClick={() => setPeriod("this_month")} />
          <PeriodBtn label="지난 달" active={period === "last_month"} onClick={() => setPeriod("last_month")} />
          <PeriodBtn label="올해" active={period === "this_year"} onClick={() => setPeriod("this_year")} />
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
              <Th>계약 수</Th>
              <Th>사용</Th>
              <Th>잔여</Th>
              <Th>회당 수업료</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-[13px] text-[#8C8270]">
                  불러오는 중…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-[13px] text-[#8C8270]">
                  해당 기간에 발급된 수업이 없어요.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.id} className="border-t border-[#E8E0D0]/70 dark:border-zinc-800">
                  <td className="px-3 py-2.5 text-[#6B5D47] dark:text-zinc-400">{i + 1}</td>
                  <td className="px-3 py-2.5 font-medium text-[#2A251D] dark:text-zinc-100 whitespace-nowrap">
                    {r.member_name}
                  </td>
                  <td className="px-3 py-2.5 text-[#6B5D47] dark:text-zinc-400">{r.age ?? "-"}</td>
                  <td className="px-3 py-2.5 text-[#6B5D47] dark:text-zinc-400">{genderLabel(r.gender)}</td>
                  <td className="px-3 py-2.5 text-[#6B5D47] dark:text-zinc-400 whitespace-nowrap">
                    {r.phone ? formatPhone(r.phone) : "-"}
                  </td>
                  <td className="px-3 py-2.5 text-[#3A342A] dark:text-zinc-300 whitespace-nowrap">
                    {r.product}
                  </td>
                  <td className="px-3 py-2.5 text-[#6B5D47] dark:text-zinc-400">{r.total}회</td>
                  <td className="px-3 py-2.5 text-[#6B5D47] dark:text-zinc-400">{r.used}회</td>
                  <td className="px-3 py-2.5 text-[#6B5D47] dark:text-zinc-400">{r.remaining}회</td>
                  <td className="px-3 py-2.5 font-semibold text-[#2A251D] dark:text-zinc-100 whitespace-nowrap tabular-nums">
                    {formatWon(r.per_session_won)}원
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------- 공통 컴포넌트 ---------- */

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

function PeriodBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-[12.5px] font-semibold border transition-colors
        ${active
          ? "border-[#6B7B3A] bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A]"
          : "border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300"
        }`}
    >
      {label}
    </button>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left font-medium px-3 py-2.5 whitespace-nowrap">{children}</th>;
}

function RevenueKpi({
  label,
  value,
  small,
  muted,
  unit = "원",
}: {
  label: string;
  value: number;
  small?: boolean;
  muted?: boolean;
  unit?: string;
}) {
  return (
    <div className="px-3.5 py-2.5 rounded-xl border border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FBF7EB]/40 dark:bg-zinc-900/40">
      <div className="text-[11.5px] text-[#A89B80] dark:text-zinc-500">{label}</div>
      <div
        className={`mt-0.5 font-bold tabular-nums ${small ? "text-[15px]" : "text-[18px]"} ${
          muted ? "text-[#A89B80] dark:text-zinc-400" : "text-[#2A251D] dark:text-zinc-100"
        }`}
      >
        {formatWon(value)} {unit}
      </div>
    </div>
  );
}

function formatExpiry(ymd: string | null): string {
  if (!ymd) return "—";
  if (ymd.startsWith("9999")) return "무기한";
  return ymd;
}

function issueTypeLabel(t: string) {
  if (t === "new") return "신규";
  if (t === "renewal") return "재등록";
  if (t === "trial") return "체험";
  if (t === "service") return "서비스";
  return t;
}
