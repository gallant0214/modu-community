"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  const router = useRouter();
  const memberId = Number(params.memberId);
  const { getIdToken } = useAuth();
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/crm/stats?tab=payroll");
  };
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
      <button
        type="button"
        onClick={goBack}
        className="inline-flex items-center gap-1 text-[13px] text-[#6B5D47] dark:text-zinc-400 hover:text-[#3A342A]"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        직원 급여 목록
      </button>

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
      {tab === "members" && <MembersTab memberId={memberId} />}
      {tab === "sessions" && <SessionsTab memberId={memberId} />}
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
    records?: {
      id: number;
      issued_at: string | null;
      member_name: string;
      member_phone: string | null;
      product_name: string;
      amount_won: number;
      issue_label: string | null;
      category: string;
    }[];
    category_totals?: Record<string, number>;
  } | null>(null);
  const [productFilter, setProductFilter] = useState<string>("all");
  // 직접 선택(custom) 기간
  const [customFrom, setCustomFrom] = useState(() => periodRange("this_month").from);
  const [customTo, setCustomTo] = useState(() => periodRange("this_month").to);

  const { from, to } =
    period === "custom" ? { from: customFrom, to: customTo } : periodRange(period);

  useEffect(() => {
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch(`/api/crm/payroll/${memberId}?from=${from}&to=${to}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) setData(await res.json());
    })();
  }, [memberId, from, to, getIdToken]);

  return (
    <>
      <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5 mb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
          <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
            전체 매출 <span className="text-[11.5px] text-[#A89B80] font-normal">(판매 실적)</span>
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
            {period === "custom" && (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className={crmInputClass}
                  style={{ width: 140 }}
                />
                <span className="text-[12px] text-[#A89B80]">~</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className={crmInputClass}
                  style={{ width: 140 }}
                />
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <RevenueKpi label="판매 매출" value={data?.breakdown.total ?? 0} />
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
          고정 {formatWon(data?.base_salary ?? 0)}원 + 수업료(진행 수업료 {formatWon(data?.commission.base ?? 0)}원 × {data?.commission.effective_rate ?? 0}%)
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
              <RevenueKpi label="매출 적용 금액" value={data?.category_totals?.[c.key] ?? 0} small />
              <RevenueKpi label="잔여 미수금" value={0} small muted />
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5">
        {(() => {
          const all = data?.records ?? [];
          const rows = productFilter === "all" ? all : all.filter((r) => r.category === productFilter);
          return (
            <>
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
                  매출 내역 ({rows.length}건)
                </h2>
                <select
                  className={`${crmInputClass} ml-auto`}
                  style={{ maxWidth: 160 }}
                  value={productFilter}
                  onChange={(e) => setProductFilter(e.target.value)}
                >
                  <option value="all">전체 상품</option>
                  <option value="membership">회원권</option>
                  <option value="group">그룹 수업</option>
                  <option value="personal">개인 레슨</option>
                  <option value="locker">락커</option>
                  <option value="goods">운동 용품</option>
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
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-12 text-center">
                          <div className="text-[13.5px] text-[#8C8270] dark:text-zinc-400">
                            데이터가 없어요
                          </div>
                          <div className="mt-1 text-[12px] text-[#A89B80] dark:text-zinc-500">
                            이 기간에 보여드릴 매출 내역이 없어요.
                          </div>
                        </td>
                      </tr>
                    ) : (
                      rows.map((r) => (
                        <tr
                          key={r.id}
                          className="border-t border-[#E8E0D0]/70 dark:border-zinc-800 text-[#3A342A] dark:text-zinc-200"
                        >
                          <td className="px-3 py-2.5 whitespace-nowrap">{r.issued_at ?? "—"}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">{r.member_name}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">
                            {r.member_phone ? formatPhone(r.member_phone) : "—"}
                          </td>
                          <td className="px-3 py-2.5">{r.product_name}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap tabular-nums font-medium">
                            {formatWon(r.amount_won)} 원
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-[#6B5D47] dark:text-zinc-400">
                            {r.issue_label ?? "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}
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

interface PassLite {
  id: number;
  lesson_kind: string | null;
  total_sessions: number;
  remaining_sessions: number;
  per_session_won: number;
  commission_rate: number | null;
  valid: boolean;
  issued_at: string | null;
  expires_at: string | null;
}
interface MemberRow {
  id: number;
  name: string;
  phone: string | null;
  birth: string | null;
  gender: string | null;
  linked: boolean;
  registered_at: string | null;
  final_expire_at: string | null;
  current_pass: string | null;
  lesson_type: string;
  status: string; // 유효 / 만료
  lesson_experience: boolean;
  total_paid_won: number;
  outstanding_total: number;
  passes: PassLite[];
}

function ageFromBirth(birth: string | null): string {
  if (!birth || !/^\d{4}-\d{2}-\d{2}$/.test(birth)) return "—";
  const b = new Date(`${birth}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age >= 0 && age < 130 ? `${age}세` : "—";
}
const GENDER_KO: Record<string, string> = { M: "남", F: "여", N: "기타" };

function MembersTab({ memberId }: { memberId: number }) {
  const { getIdToken } = useAuth();
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "dormant">("all");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null); // 요율 편집 펼친 회원
  const [savingPass, setSavingPass] = useState<number | null>(null);
  // 강사에게 설정된 기본 급여 % — 수강권별 요율 입력칸의 기본값으로 쓴다
  const [defaultRate, setDefaultRate] = useState<number>(0);

  // 수강권 요율 override 저장 (비우면 강사 기본요율). 대표자/관리자만.
  const saveRate = async (memberIdRow: number, passId: number, raw: string) => {
    const trimmed = raw.trim();
    const rate = trimmed === "" ? null : Number(trimmed);
    if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 100)) {
      alert("요율은 0~100 사이 숫자로 입력해 주세요.");
      return;
    }
    setSavingPass(passId);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/payroll/pass-commission`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ pass_id: passId, rate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
      setRows((prev) =>
        prev.map((m) =>
          m.id === memberIdRow
            ? { ...m, passes: m.passes.map((p) => (p.id === passId ? { ...p, commission_rate: rate } : p)) }
            : m
        )
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSavingPass(null);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const token = await getIdToken();
        if (!token) return;
        const res = await fetch(`/api/crm/payroll/${memberId}/members`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (res.ok) {
          const json = await res.json();
          setRows(json.members ?? []);
          setDefaultRate(Number(json.default_commission_rate ?? 0));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [memberId, getIdToken]);

  const today = new Date().toISOString().slice(0, 10);
  const filtered = rows.filter((r) => {
    if (statusFilter === "active" && !(r.final_expire_at && r.final_expire_at >= today)) return false;
    if (statusFilter === "dormant" && r.final_expire_at && r.final_expire_at >= today) return false;
    const kw = q.trim().toLowerCase();
    if (kw && !`${r.name} ${r.phone ?? ""}`.toLowerCase().includes(kw)) return false;
    return true;
  });

  return (
    <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5">
      <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-3">
        총 {filtered.length}명
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-2 mb-3">
        <div>
          <div className="text-[11.5px] text-[#A89B80] mb-1">필터</div>
          <select
            className={crmInputClass}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "dormant")}
          >
            <option value="all">회원 전체</option>
            <option value="active">활성</option>
            <option value="dormant">휴면</option>
          </select>
        </div>
        <div>
          <div className="text-[11.5px] text-[#A89B80] mb-1">검색</div>
          <input
            type="text"
            className={crmInputClass}
            placeholder="이름 및 연락처로 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#E8E0D0] dark:border-zinc-800">
        <table className="w-full text-[13px]">
          <thead className="bg-[#FBF7EB] dark:bg-zinc-900/80 text-[#6B5D47] dark:text-zinc-400">
            <tr>
              <Th>번호</Th>
              <Th>이름</Th>
              <Th>상태</Th>
              <Th>종류</Th>
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
              <Th>수업료 요율</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={15} className="px-3 py-12 text-center text-[13px] text-[#8C8270]">
                  불러오는 중…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={15} className="px-3 py-12 text-center">
                  <div className="text-[13.5px] text-[#8C8270] dark:text-zinc-400">데이터가 없어요</div>
                  <div className="mt-1 text-[12px] text-[#A89B80] dark:text-zinc-500">
                    {rows.length === 0 ? "아직 담당 회원이 없어요." : "조건에 맞는 회원이 없어요."}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <Fragment key={r.id}>
                <tr
                  className="border-t border-[#E8E0D0]/70 dark:border-zinc-800 text-[#3A342A] dark:text-zinc-200"
                >
                  <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-[#8C8270]">{r.id}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap font-medium">
                    <a href={`/crm/members/${r.id}`} className="hover:underline">{r.name}</a>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[11.5px] font-semibold ${
                        r.status === "유효"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-300"
                          : "bg-[#F5F0E5] text-[#A89B80] dark:bg-zinc-800 dark:text-zinc-500"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{r.lesson_type}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{r.linked ? "사용" : "—"}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{r.lesson_experience ? "있음" : "없음"}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{ageFromBirth(r.birth)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{r.gender ? GENDER_KO[r.gender] ?? "—" : "—"}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">
                    {r.phone ? formatPhone(r.phone) : "—"}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{r.registered_at ?? "—"}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{r.final_expire_at ?? "—"}</td>
                  <td className="px-3 py-2.5">{r.current_pass ?? "—"}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{formatWon(r.total_paid_won)} 원</td>
                  <td className={`px-3 py-2.5 whitespace-nowrap tabular-nums ${r.outstanding_total > 0 ? "text-[#B4452A] font-medium" : "text-[#A89B80]"}`}>
                    {formatWon(r.outstanding_total)} 원
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {r.passes.length === 0 ? (
                      <span className="text-[#A89B80]">—</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                        className="px-2 py-1 rounded-lg border border-[#6B7B3A] text-[#6B7B3A] dark:border-[#A8B87A] dark:text-[#A8B87A] text-[12px] font-semibold hover:bg-[#6B7B3A]/8"
                      >
                        {(() => {
                          const set = r.passes.filter((p) => p.commission_rate != null).length;
                          return set > 0 ? `설정 ${set}건 ▾` : "요율 설정 ▾";
                        })()}
                      </button>
                    )}
                  </td>
                </tr>
                {expanded === r.id && (
                  <tr className="bg-[#FBF7EB]/60 dark:bg-zinc-900/60">
                    <td colSpan={15} className="px-3 py-3">
                      <div className="text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-300 mb-2">
                        {r.name} · 발급 수강권별 커미션 요율{" "}
                        <span className="font-normal text-[#A89B80]">
                          (강사 기본 {defaultRate}% 가 기본값 · 바꾼 수강권만 따로 적용돼요)
                        </span>
                      </div>
                      <div className="space-y-1.5 max-w-[720px]">
                        {r.passes.map((p) => (
                          <PassRateRow
                            key={`${p.id}:${p.commission_rate ?? "base"}:${defaultRate}`}
                            pass={p}
                            defaultRate={defaultRate}
                            saving={savingPass === p.id}
                            onSave={(raw) => saveRate(r.id, p.id, raw)}
                          />
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * 수강권 1건의 커미션 요율(%) 편집 행.
 * 입력칸은 강사에게 설정된 기본 급여 %로 채워두고(개별 지정이 있으면 그 값),
 * 사용자가 값을 바꿨을 때만 저장이 활성화된다. '기본값' 버튼으로 개별 지정을 지울 수 있다.
 */
function PassRateRow({
  pass,
  defaultRate,
  saving,
  onSave,
}: {
  pass: PassLite;
  /** 강사 기본 급여 % (개별 지정이 없을 때 실제 적용되는 값) */
  defaultRate: number;
  saving: boolean;
  onSave: (raw: string) => void;
}) {
  // 개별 지정이 있으면 그 값, 없으면 강사 기본값을 보여준다.
  // (저장 등으로 값이 바뀌면 부모가 key 를 바꿔 이 행을 새로 마운트한다 → effect 동기화 불필요)
  const shown = pass.commission_rate != null ? pass.commission_rate : defaultRate;
  const [val, setVal] = useState(String(shown));
  const overridden = pass.commission_rate != null;
  // 지금 실제 적용 중인 값과 달라졌을 때만 저장 가능
  const dirty = val.trim() !== "" && Number(val) !== shown;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
      <span className="min-w-[150px] font-medium text-[#3A342A] dark:text-zinc-200">
        {pass.lesson_kind ?? "수강권"}
        {!pass.valid && <span className="ml-1 text-[11px] text-[#A89B80]">(만료)</span>}
      </span>
      <span className="text-[#8C8270]">
        회당 {formatWon(pass.per_session_won)}원 · 잔여 {pass.remaining_sessions}/{pass.total_sessions}
      </span>
      <span className="flex items-center gap-1 ml-auto">
        {!overridden && <span className="text-[11px] text-[#A89B80]">기본</span>}
        <input
          type="number"
          min={0}
          max={100}
          step="0.1"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder={String(defaultRate)}
          className="w-20 px-2 py-1 rounded-lg border border-[#D9CDB8] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-right text-[12.5px] focus:outline-none focus:border-[#6B7B3A]"
        />
        <span className="text-[#8C8270]">%</span>
        <button
          type="button"
          disabled={saving || !dirty}
          onClick={() => onSave(val)}
          className="px-2.5 py-1 rounded-lg bg-[#6B7B3A] text-white text-[12px] font-semibold disabled:opacity-40 hover:bg-[#5a6932]"
        >
          {saving ? "저장 중" : "저장"}
        </button>
        {overridden && (
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave("")}
            title={`강사 기본요율(${defaultRate}%)을 따르도록 되돌려요`}
            className="px-2 py-1 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[11.5px] text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5] disabled:opacity-40"
          >
            기본값
          </button>
        )}
      </span>
    </div>
  );
}

/* ─── 수업 내역 탭 (개인·그룹 통합) ────────────────── */

interface LessonRow {
  id: number;
  starts_at: string;
  status: string;
  member_id: number;
  member_name: string;
  member_phone: string | null;
  lesson_kind: string | null;
  per_session_won?: number;
  fee_won?: number;
}

// 기간 → KST 로컬 기준 from/to (YYYY-MM-DD)
function periodRange(p: Period): { from: string; to: string } {
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const now = new Date();
  if (p === "last_month") {
    return {
      from: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }
  if (p === "this_year") {
    return { from: ymd(new Date(now.getFullYear(), 0, 1)), to: ymd(new Date(now.getFullYear(), 11, 31)) };
  }
  // this_month (기본)
  return {
    from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

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

// 통계 → 수업진행목록 을 이 강사(담당강사 자동 선택)로 고정하고 기간만 선택.
function SessionsTab({ memberId }: { memberId: number }) {
  const { getIdToken } = useAuth();
  const [period, setPeriod] = useState<Period>("this_month");
  // 직접 선택용 from/to (기본값 = 이번 달)
  const [customFrom, setCustomFrom] = useState(() => periodRange("this_month").from);
  const [customTo, setCustomTo] = useState(() => periodRange("this_month").to);
  const [rows, setRows] = useState<LessonRow[]>([]);
  const [summary, setSummary] = useState<{ total: number; attended: number; noshow: number } | null>(null);
  const [feeTotal, setFeeTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const { from, to } = period === "custom" ? { from: customFrom, to: customTo } : periodRange(period);
      if (!from || !to) return;
      // 급여 라우트의 진행 수업(출석·노쇼) 라인 = 회원별 회당 수업료 포함. 합계=이달 지급 수업료.
      const res = await fetch(`/api/crm/payroll/${memberId}?from=${from}&to=${to}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) return;
      const d = await res.json();
      const lines: LessonRow[] = d.session_lines ?? [];
      setRows(lines);
      setFeeTotal(Number(d.session_fee_total) || 0);
      setSummary({
        total: lines.length,
        attended: lines.filter((l) => l.status === "attended").length,
        noshow: lines.filter((l) => l.status === "noshow").length,
      });
    } finally {
      setLoading(false);
    }
  }, [getIdToken, memberId, period, customFrom, customTo]);

  useEffect(() => {
    load();
  }, [load]);

  const statusLabel = (s: string) =>
    s === "attended" ? "출석" : s === "noshow" ? "노쇼" : s;

  return (
    <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
          수업 내역 <span className="text-[11.5px] text-[#A89B80] font-normal">(진행분: 출석·노쇼)</span>
        </h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] text-[#A89B80]">기간</span>
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
          {period === "custom" && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => setCustomFrom(e.target.value)}
                className={crmInputClass}
                style={{ width: 150 }}
              />
              <span className="text-[12px] text-[#A89B80]">~</span>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
                className={crmInputClass}
                style={{ width: 150 }}
              />
            </div>
          )}
        </div>
      </div>

      {summary && (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] mb-3">
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

      <div className="overflow-x-auto rounded-xl border border-[#E8E0D0] dark:border-zinc-800">
        <table className="w-full text-[13px]">
          <thead className="bg-[#FBF7EB] dark:bg-zinc-900/80 text-[#6B5D47] dark:text-zinc-400">
            <tr>
              <Th>번호</Th>
              <Th>수업 일시</Th>
              <Th>회원</Th>
              <Th>연락처</Th>
              <Th>수업</Th>
              <Th>상태</Th>
              <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">수업료</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-12 text-center text-[13px] text-[#8C8270]">불러오는 중…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-12 text-center">
                  <div className="text-[13.5px] text-[#8C8270] dark:text-zinc-400">데이터가 없어요</div>
                  <div className="mt-1 text-[12px] text-[#A89B80] dark:text-zinc-500">
                    해당 기간에 진행된 수업이 없어요.
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.id} className="border-t border-[#E8E0D0]/70 dark:border-zinc-800">
                  <td className="px-3 py-2.5 text-[#6B5D47] dark:text-zinc-400">{i + 1}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-[#3A342A] dark:text-zinc-200">{fmtKstDateTime(r.starts_at)}</td>
                  <td className="px-3 py-2.5 font-medium text-[#2A251D] dark:text-zinc-100 whitespace-nowrap">
                    <a href={`/crm/members/${r.member_id}`} className="hover:underline">{r.member_name}</a>
                  </td>
                  <td className="px-3 py-2.5 text-[#6B5D47] dark:text-zinc-400 whitespace-nowrap tabular-nums">{r.member_phone ? formatPhone(r.member_phone) : "-"}</td>
                  <td className="px-3 py-2.5 text-[#3A342A] dark:text-zinc-300 whitespace-nowrap">{r.lesson_kind ?? "-"}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={r.status === "noshow" ? "text-[#B4452A] font-medium" : "text-[#6B7B3A] dark:text-[#A8B87A] font-medium"}>
                      {statusLabel(r.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-right tabular-nums font-semibold text-[#2A251D] dark:text-zinc-100">
                    {formatWon(r.fee_won ?? 0)}원
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {!loading && rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB] dark:bg-zinc-900/80">
                <td colSpan={6} className="px-3 py-3 text-right font-bold text-[#3A342A] dark:text-zinc-100">
                  총 수업료 합계
                </td>
                <td className="px-3 py-3 text-right tabular-nums font-bold text-[#6B7B3A] dark:text-[#A8B87A]">
                  {formatWon(feeTotal)}원
                </td>
              </tr>
            </tfoot>
          )}
        </table>
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
      className={`px-3.5 py-2 -mb-px text-[15px] font-bold border-b-2 transition-colors whitespace-nowrap
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
