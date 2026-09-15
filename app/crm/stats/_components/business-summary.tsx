"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/auth-provider";
import { formatWon } from "../../_components/crm-labels";

type Status = "good" | "caution" | "risk" | "unknown";

interface MonthPoint {
  ym: string;
  revenue: number;
  expense: number;
  net: number;
}
interface SummaryResp {
  current_ym: string;
  last_full_ym: string;
  months: MonthPoint[];
  current: {
    revenue: number;
    expense: number;
    net: number;
    bep: number | null;
    bep_rate: number | null;
    elapsed_ratio: number;
    projected_revenue: number | null;
  };
  last_full: {
    revenue: number;
    expense: number;
    net: number;
    net_margin: number | null;
    expense_ratio: number | null;
    labor_ratio: number | null;
    bep: number | null;
    bep_rate: number | null;
    breakdown: { fixed: number; salary: number; vat_payable: number; card_fee: number; additional: number; income: number };
    mix: { membership: number; lesson: number; rental: number; locker: number; goods: number };
  };
  liability: {
    total: number;
    membership: number;
    pass: number;
    not_started: number;
    in_progress: number;
    months_of_revenue: number | null;
  };
  averages: { revenue3: number; net3: number; prev_net3: number };
  signals: { key: string; label: string; status: Status; value_text: string; detail: string }[];
  grade: "stable" | "caution" | "risk";
  grade_reason: string;
  data_warnings: string[];
}

const pct = (r: number | null | undefined) =>
  r == null || !Number.isFinite(r) ? "—" : `${(r * 100).toFixed(1)}%`;
function shortWon(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 100_000_000) return `${sign}${(a / 100_000_000).toFixed(1)}억`;
  if (a >= 10_000) return `${sign}${Math.round(a / 10_000).toLocaleString("ko-KR")}만`;
  return `${sign}${Math.round(a).toLocaleString("ko-KR")}`;
}
const monthLabel = (ym: string) => `${Number(ym.slice(5, 7))}월`;
const ymLabel = (ym: string) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월`;

const STATUS: Record<Status, { label: string; dot: string; chip: string }> = {
  good: {
    label: "양호",
    dot: "bg-emerald-500",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  caution: {
    label: "주의",
    dot: "bg-amber-500",
    chip: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  },
  risk: {
    label: "위험",
    dot: "bg-red-500",
    chip: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
  },
  unknown: {
    label: "판단 보류",
    dot: "bg-zinc-400",
    chip: "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400",
  },
};

const GRADE: Record<SummaryResp["grade"], { label: string; box: string; badge: string; lead: string }> = {
  stable: {
    label: "안정",
    box: "border-emerald-300/70 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/25",
    badge: "bg-emerald-600 text-white",
    lead: "지금 흐름이면 운영에 무리가 없어요.",
  },
  caution: {
    label: "주의",
    box: "border-amber-300/70 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/25",
    badge: "bg-amber-500 text-white",
    lead: "당장 위험하진 않지만 신경 써야 할 지표가 있어요.",
  },
  risk: {
    label: "위험",
    box: "border-red-300/70 bg-red-50/60 dark:border-red-900 dark:bg-red-950/25",
    badge: "bg-red-600 text-white",
    lead: "여러 지표가 나빠요. 지출 구조나 매출 대책을 점검할 때예요.",
  },
};

/** 통계 > 경영 요약 */
export function BusinessSummary() {
  const { getIdToken } = useAuth();
  const [data, setData] = useState<SummaryResp | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        const res = await fetch("/api/crm/stats/business-summary", {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error || "조회 실패");
        if (!cancelled) setData(j as SummaryResp);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "네트워크 오류");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getIdToken]);

  if (loading) {
    return (
      <div className="py-10 text-center text-[13px] text-[#8C8270]">
        최근 12개월 정산을 계산하는 중이에요… (최대 몇 초 걸려요)
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
        {error || "데이터를 불러오지 못했어요."}
      </div>
    );
  }

  const g = GRADE[data.grade];
  const lf = data.last_full;
  const b = lf.breakdown;

  return (
    <div className="space-y-5">
      {/* 종합 등급 */}
      <section className={`rounded-2xl border-2 px-5 py-5 ${g.box}`}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-400">경영 안정성</span>
          <span className={`rounded-full px-3 py-1 text-[14px] font-bold ${g.badge}`}>{g.label}</span>
          <span className="text-[12px] text-[#8C8270] dark:text-zinc-500">
            {ymLabel(data.last_full_ym)} 완료 기준
          </span>
        </div>
        <p className="mt-2 text-[15px] font-semibold text-[#2A251D] dark:text-zinc-100">{g.lead}</p>
        <p className="mt-1 text-[12.5px] text-[#6B5D47] dark:text-zinc-400">{data.grade_reason}</p>
      </section>

      {/* 데이터 보완 경고 */}
      {data.data_warnings.length > 0 && (
        <section className="rounded-2xl border border-amber-300/70 bg-amber-50/70 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/25">
          <div className="text-[12.5px] font-bold text-amber-900 dark:text-amber-200">
            ⚠️ 입력이 빠진 항목이 있어 실제보다 좋게 보일 수 있어요
          </div>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[12.5px] leading-relaxed text-amber-900/90 dark:text-amber-200/90">
            {data.data_warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              href="/crm/settings?tab=expenses"
              className="rounded-lg border border-amber-400/70 bg-white px-2.5 py-1 text-[12px] font-semibold text-amber-900 hover:bg-amber-100 dark:bg-zinc-900 dark:text-amber-200"
            >
              고정 지출·카드 수수료 설정 →
            </Link>
            <Link
              href="/crm/stats?tab=settlement"
              className="rounded-lg border border-amber-400/70 bg-white px-2.5 py-1 text-[12px] font-semibold text-amber-900 hover:bg-amber-100 dark:bg-zinc-900 dark:text-amber-200"
            >
              추가 지출 등록 →
            </Link>
          </div>
        </section>
      )}

      {/* 지난달 핵심 */}
      <section>
        <SectionTitle title={`${ymLabel(data.last_full_ym)} 손익`} sub="직전 완료 월" />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Kpi label="매출" value={`${formatWon(lf.revenue)}원`} />
          <Kpi label="총 지출" value={`${formatWon(lf.expense)}원`} sub={`매출 대비 ${pct(lf.expense_ratio)}`} />
          <Kpi
            label="순이익"
            value={`${formatWon(lf.net)}원`}
            tone={lf.net < 0 ? "bad" : "good"}
          />
          <Kpi label="순이익률" value={pct(lf.net_margin)} tone={(lf.net_margin ?? 0) < 0 ? "bad" : undefined} />
        </div>
      </section>

      {/* 손익분기점 */}
      <section className="rounded-2xl border border-[#E8E0D0] bg-[#FEFCF7] px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <SectionTitle
          title="손익분기점"
          sub="이만큼은 팔아야 적자를 면하는 매출"
          help="고정비(고정지출·고정급·추가지출) ÷ (1 − 변동비율). 변동비 = 수업료·성과급·카드수수료·매출세액."
        />
        <div className="grid gap-4 md:grid-cols-2">
          <BepBar
            title={`${ymLabel(data.last_full_ym)} (완료)`}
            revenue={lf.revenue}
            bep={lf.bep}
            rate={lf.bep_rate}
          />
          <BepBar
            title={`${ymLabel(data.current_ym)} (진행 중)`}
            revenue={data.current.revenue}
            bep={data.current.bep}
            rate={data.current.bep_rate}
            paceRatio={data.current.elapsed_ratio}
            projected={data.current.projected_revenue}
          />
        </div>
      </section>

      {/* 매출 대비 지출 구성 */}
      <section className="rounded-2xl border border-[#E8E0D0] bg-[#FEFCF7] px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <SectionTitle title="매출 대비 지출 구성" sub={`${ymLabel(data.last_full_ym)} · 매출 100% 기준`} />
        <ExpenseComposition revenue={lf.revenue} breakdown={b} net={lf.net} />
      </section>

      {/* 12개월 추세 */}
      <section className="rounded-2xl border border-[#E8E0D0] bg-[#FEFCF7] px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <SectionTitle title="최근 12개월 추세" sub="막대 = 매출·지출, 선 = 순이익 (이번 달은 진행 중)" />
        <TrendChart months={data.months} currentYm={data.current_ym} />
      </section>

      {/* 안정성 체크 */}
      <section className="rounded-2xl border border-[#E8E0D0] bg-[#FEFCF7] px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <SectionTitle title="안정성 체크" sub="각 지표의 기준과 현재 상태" />
        <ul className="divide-y divide-[#E8E0D0]/60 dark:divide-zinc-800">
          {data.signals.map((s) => {
            const st = STATUS[s.status];
            return (
              <li key={s.key} className="flex flex-wrap items-start gap-3 py-2.5">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${st.dot}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-semibold text-[#2A251D] dark:text-zinc-100">{s.label}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${st.chip}`}>{st.label}</span>
                  </div>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-[#8C8270] dark:text-zinc-500">{s.detail}</p>
                </div>
                <span className="shrink-0 text-[14px] font-bold tabular-nums text-[#3A342A] dark:text-zinc-100">
                  {s.value_text}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 선수금 */}
      <section className="rounded-2xl border border-[#E8E0D0] bg-[#FEFCF7] px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <SectionTitle
          title="선수금(잠재부채)"
          sub="이미 받았지만 아직 서비스로 갚지 않은 돈"
          help="장기권을 많이 팔수록 당장 현금은 늘지만, 앞으로 제공해야 할 수업·이용 기간도 함께 늘어납니다."
        />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Kpi label="선수금 합계" value={`${formatWon(data.liability.total)}원`} />
          <Kpi
            label="월평균 매출 대비"
            value={data.liability.months_of_revenue == null ? "—" : `${data.liability.months_of_revenue.toFixed(1)}배`}
            sub={`최근 3개월 평균 ${shortWon(data.averages.revenue3)}원`}
          />
          <Kpi label="회원권·대여" value={`${formatWon(data.liability.membership)}원`} />
          <Kpi label="수강권(PT·레슨)" value={`${formatWon(data.liability.pass)}원`} />
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-[#A89B80]">
          아직 시작 전 {formatWon(data.liability.not_started)}원 · 이용 중 {formatWon(data.liability.in_progress)}원. 신규
          매출이 한동안 끊겨도 이 금액만큼은 서비스를 계속 제공해야 해요.
        </p>
      </section>

      {/* 매출 구성비 */}
      <section className="rounded-2xl border border-[#E8E0D0] bg-[#FEFCF7] px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <SectionTitle
          title="매출 구성비"
          sub={ymLabel(data.last_full_ym)}
          help="한 종류 의존도가 너무 높으면(예: PT 80% 이상) 핵심 강사 이탈 시 매출이 크게 흔들려요."
        />
        <MixBar mix={lf.mix} />
      </section>
    </div>
  );
}

/* ─── 하위 컴포넌트 ─────────────────────────── */

function SectionTitle({ title, sub, help }: { title: string; sub?: string; help?: string }) {
  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-[14px] font-bold text-[#2A251D] dark:text-zinc-100">{title}</h3>
        {sub && <span className="text-[12px] text-[#A89B80]">{sub}</span>}
      </div>
      {help && <p className="mt-0.5 text-[11.5px] leading-relaxed text-[#A89B80]">{help}</p>}
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border border-[#E8E0D0] bg-white px-3.5 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-[11.5px] text-[#8C8270] dark:text-zinc-500">{label}</div>
      <div
        className={`mt-0.5 text-[17px] font-bold tabular-nums ${
          tone === "bad"
            ? "text-red-600 dark:text-red-400"
            : tone === "good"
              ? "text-[#4d5a29] dark:text-[#A8B87A]"
              : "text-[#2A251D] dark:text-zinc-100"
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-[#A89B80]">{sub}</div>}
    </div>
  );
}

function BepBar({
  title,
  revenue,
  bep,
  rate,
  paceRatio,
  projected,
}: {
  title: string;
  revenue: number;
  bep: number | null;
  rate: number | null;
  paceRatio?: number;
  projected?: number | null;
}) {
  if (bep == null || bep <= 0) {
    return (
      <div>
        <div className="text-[12.5px] font-semibold text-[#3A342A] dark:text-zinc-200">{title}</div>
        <div className="mt-2 text-[12px] text-[#A89B80]">계산할 매출·비용 데이터가 부족해요.</div>
      </div>
    );
  }
  const fill = Math.min(1, Math.max(0, revenue / bep));
  const ok = (rate ?? 0) >= 1;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-semibold text-[#3A342A] dark:text-zinc-200">{title}</span>
        <span className={`text-[15px] font-bold tabular-nums ${ok ? "text-[#4d5a29] dark:text-[#A8B87A]" : "text-red-600 dark:text-red-400"}`}>
          {pct(rate)}
        </span>
      </div>
      <div className="relative mt-2 h-3.5 w-full overflow-hidden rounded-full bg-[#EFE8DA] dark:bg-zinc-800">
        <div
          className={`h-full rounded-full ${ok ? "bg-[#6B7B3A]" : "bg-[#D08A4E]"}`}
          style={{ width: `${fill * 100}%` }}
        />
        {paceRatio != null && (
          <div
            className="absolute top-0 h-full w-0.5 bg-[#2A251D] dark:bg-zinc-100"
            style={{ left: `${Math.min(100, paceRatio * 100)}%` }}
            title="오늘까지 지나간 날짜 비율"
          />
        )}
      </div>
      <div className="mt-1.5 text-[11.5px] leading-relaxed text-[#8C8270] dark:text-zinc-500">
        매출 {formatWon(revenue)}원 / 손익분기 {formatWon(bep)}원
        {paceRatio != null && (
          <>
            {" "}· 이번 달 {Math.round(paceRatio * 100)}% 지남(검은 선)
            {projected != null && ` · 이 속도면 월말 약 ${shortWon(projected)}원`}
          </>
        )}
      </div>
    </div>
  );
}

function ExpenseComposition({
  revenue,
  breakdown: b,
  net,
}: {
  revenue: number;
  breakdown: SummaryResp["last_full"]["breakdown"];
  net: number;
}) {
  const items = [
    { key: "fixed", label: "고정 지출", v: b.fixed, cls: "bg-[#B08A5A]" },
    { key: "salary", label: "직원 급여", v: b.salary, cls: "bg-[#D08A4E]" },
    { key: "vat", label: "부가세 납부", v: b.vat_payable, cls: "bg-[#5A8BB0]" },
    { key: "card", label: "카드 수수료", v: b.card_fee, cls: "bg-[#8B6BAA]" },
    { key: "add", label: "추가 지출", v: b.additional, cls: "bg-[#A89B80]" },
  ];
  const expense = items.reduce((s, x) => s + x.v, 0);
  const base = Math.max(1, revenue + b.income, expense);
  const profit = Math.max(0, net);
  if (revenue <= 0) {
    return <div className="text-[12.5px] text-[#A89B80]">해당 월 매출이 없어요.</div>;
  }
  return (
    <div>
      <div className="flex h-5 w-full overflow-hidden rounded-full bg-[#EFE8DA] dark:bg-zinc-800">
        {items.map((x) =>
          x.v > 0 ? <div key={x.key} className={x.cls} style={{ width: `${(x.v / base) * 100}%` }} title={x.label} /> : null
        )}
        {profit > 0 && <div className="bg-[#6B7B3A]" style={{ width: `${(profit / base) * 100}%` }} title="순이익" />}
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {items.map((x) => (
          <li key={x.key} className="flex items-center justify-between gap-2 text-[12.5px]">
            <span className="flex items-center gap-2 text-[#3A342A] dark:text-zinc-300">
              <span className={`h-2.5 w-2.5 rounded-sm ${x.cls}`} />
              {x.label}
            </span>
            <span className="tabular-nums text-[#6B5D47] dark:text-zinc-400">
              {formatWon(x.v)}원 <span className="text-[#A89B80]">({pct(x.v / revenue)})</span>
            </span>
          </li>
        ))}
        <li className="flex items-center justify-between gap-2 text-[12.5px] font-semibold">
          <span className="flex items-center gap-2 text-[#2A251D] dark:text-zinc-100">
            <span className={`h-2.5 w-2.5 rounded-sm ${net < 0 ? "bg-red-500" : "bg-[#6B7B3A]"}`} />
            {net < 0 ? "적자" : "순이익"}
          </span>
          <span className={`tabular-nums ${net < 0 ? "text-red-600 dark:text-red-400" : "text-[#4d5a29] dark:text-[#A8B87A]"}`}>
            {formatWon(net)}원 <span className="font-normal text-[#A89B80]">({pct(net / revenue)})</span>
          </span>
        </li>
      </ul>
      {b.income > 0 && (
        <p className="mt-2 text-[11.5px] text-[#A89B80]">추가 수입 {formatWon(b.income)}원 포함.</p>
      )}
    </div>
  );
}

function TrendChart({ months, currentYm }: { months: MonthPoint[]; currentYm: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (months.length === 0) return <div className="text-[12.5px] text-[#A89B80]">데이터가 없어요.</div>;
  const W = 680;
  const H = 240;
  const padL = 52;
  const padR = 12;
  const padT = 16;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const maxV = Math.max(1, ...months.map((p) => Math.max(p.revenue, p.expense, p.net)));
  const minV = Math.min(0, ...months.map((p) => Math.min(p.net, p.revenue, p.expense)));
  const span = maxV - minV || 1;
  const y = (v: number) => padT + ((maxV - v) / span) * innerH;
  const slot = innerW / months.length;
  const barW = Math.max(4, Math.min(16, slot / 3));
  const cx = (i: number) => padL + i * slot + slot / 2;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => maxV - span * t);
  const netPath = months.map((p, i) => `${i === 0 ? "M" : "L"}${cx(i)},${y(p.net)}`).join(" ");
  const h = hover != null ? months[hover] : null;

  return (
    <div className="relative w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ minWidth: 520 }}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="stroke-[#EFE8DA] dark:stroke-zinc-800" strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 3} textAnchor="end" className="fill-[#A89B80] text-[10px]">
              {shortWon(t)}
            </text>
          </g>
        ))}
        {minV < 0 && (
          <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} className="stroke-[#A89B80]" strokeWidth={1.2} />
        )}
        {months.map((p, i) => {
          const isCur = p.ym === currentYm;
          return (
            <g key={p.ym} onMouseEnter={() => setHover(i)}>
              <rect x={padL + i * slot} y={padT} width={slot} height={innerH} fill="transparent" />
              <rect
                x={cx(i) - barW - 1}
                y={y(Math.max(0, p.revenue))}
                width={barW}
                height={Math.max(0, y(0) - y(Math.max(0, p.revenue)))}
                rx={2}
                className={isCur ? "fill-[#C9D29B]/50" : "fill-[#C9D29B] dark:fill-[#6B7B3A]"}
              />
              <rect
                x={cx(i) + 1}
                y={y(Math.max(0, p.expense))}
                width={barW}
                height={Math.max(0, y(0) - y(Math.max(0, p.expense)))}
                rx={2}
                className={isCur ? "fill-[#D9B48A]/50" : "fill-[#D9B48A] dark:fill-[#B47B2A]"}
              />
              <text x={cx(i)} y={H - 8} textAnchor="middle" className="fill-[#A89B80] text-[10px]">
                {monthLabel(p.ym)}
                {isCur ? "*" : ""}
              </text>
            </g>
          );
        })}
        <path d={netPath} fill="none" className="stroke-[#3A342A] dark:stroke-zinc-100" strokeWidth={2} />
        {months.map((p, i) => (
          <circle
            key={`n-${p.ym}`}
            cx={cx(i)}
            cy={y(p.net)}
            r={hover === i ? 4.5 : 3}
            className={p.net < 0 ? "fill-red-500" : "fill-[#3A342A] dark:fill-zinc-100"}
          />
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-4 text-[11.5px] text-[#8C8270]">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#C9D29B]" />매출</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#D9B48A]" />지출</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 bg-[#3A342A] dark:bg-zinc-100" />순이익</span>
        <span>* 이번 달(진행 중)</span>
      </div>
      {h && (
        <div className="pointer-events-none absolute right-2 top-2 rounded-lg border border-[#E8E0D0] bg-white/95 px-3 py-2 text-[12px] shadow-md dark:border-zinc-700 dark:bg-zinc-900/95">
          <div className="font-bold text-[#2A251D] dark:text-zinc-100">{ymLabel(h.ym)}</div>
          <div className="tabular-nums text-[#6B5D47] dark:text-zinc-400">매출 {formatWon(h.revenue)}원</div>
          <div className="tabular-nums text-[#6B5D47] dark:text-zinc-400">지출 {formatWon(h.expense)}원</div>
          <div className={`tabular-nums font-semibold ${h.net < 0 ? "text-red-600" : "text-[#4d5a29] dark:text-[#A8B87A]"}`}>
            순이익 {formatWon(h.net)}원
          </div>
        </div>
      )}
    </div>
  );
}

function MixBar({ mix }: { mix: SummaryResp["last_full"]["mix"] }) {
  const items = [
    { key: "membership", label: "회원권", v: mix.membership, cls: "bg-[#6B7B3A]" },
    { key: "lesson", label: "수강권(PT·레슨)", v: mix.lesson, cls: "bg-[#D08A4E]" },
    { key: "rental", label: "운동복·대여", v: mix.rental, cls: "bg-[#5A8BB0]" },
    { key: "locker", label: "락커", v: mix.locker, cls: "bg-[#8B6BAA]" },
    { key: "goods", label: "기타", v: mix.goods, cls: "bg-[#A89B80]" },
  ];
  const total = items.reduce((s, x) => s + Math.max(0, x.v), 0);
  if (total <= 0) return <div className="text-[12.5px] text-[#A89B80]">해당 월 매출이 없어요.</div>;
  const top = items.reduce((a, x) => (x.v > a.v ? x : a), items[0]);
  const topShare = top.v / total;
  return (
    <div>
      <div className="flex h-5 w-full overflow-hidden rounded-full bg-[#EFE8DA] dark:bg-zinc-800">
        {items.map((x) =>
          x.v > 0 ? <div key={x.key} className={x.cls} style={{ width: `${(x.v / total) * 100}%` }} title={x.label} /> : null
        )}
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {items.map((x) => (
          <li key={x.key} className="flex items-center justify-between gap-2 text-[12.5px]">
            <span className="flex items-center gap-2 text-[#3A342A] dark:text-zinc-300">
              <span className={`h-2.5 w-2.5 rounded-sm ${x.cls}`} />
              {x.label}
            </span>
            <span className="tabular-nums text-[#6B5D47] dark:text-zinc-400">
              {formatWon(x.v)}원 <span className="text-[#A89B80]">({pct(Math.max(0, x.v) / total)})</span>
            </span>
          </li>
        ))}
      </ul>
      {topShare >= 0.7 && (
        <p className="mt-2 text-[12px] font-medium text-amber-700 dark:text-amber-300">
          {top.label} 비중이 {pct(topShare)}로 높아요. 한 매출원에 치우쳐 있으면 변동에 취약해요.
        </p>
      )}
    </div>
  );
}
