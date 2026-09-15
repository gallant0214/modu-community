import { NextResponse } from "next/server";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { computeSettlement, monthPeriod, type SettlementResult } from "@/app/lib/crm-settlement";
import { computeLiabilitySnapshot } from "@/app/lib/crm-liability";
import { cached, crmCacheKey } from "@/app/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/crm/stats/business-summary — 경영 요약 (직급 권한 stats.business_summary)
 *
 * 최근 12개월(이번 달 포함) 월별 정산을 계산해
 *  - 매출 대비 지출 구성, 손익분기점(BEP) 달성률
 *  - 12개월 순이익 추세, 선수금(잠재부채) 부담
 *  - 안정성 신호 6종 → 종합 등급(안정/주의/위험)
 * 을 한 번에 돌려준다.
 *
 * 이번 달은 진행 중이라 고정비가 한 달치 다 잡혀 손실처럼 보이므로,
 * 등급 판정은 '직전 완료 월' 기준으로 하고 이번 달은 진행률로 따로 보여준다.
 * 12개월 × 정산 계산이 무거워 2분 캐시.
 */

type Status = "good" | "caution" | "risk" | "unknown";
interface Signal {
  key: string;
  label: string;
  status: Status;
  value_text: string;
  detail: string;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
function shiftYm(y: number, m: number, delta: number): string {
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad2((idx % 12) + 1)}`;
}
const pctText = (r: number | null) => (r == null || !Number.isFinite(r) ? "—" : `${(r * 100).toFixed(1)}%`);
const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * 손익분기점 계산용 비용 분해.
 *  고정비 = 고정지출 + 고정 인건비(고정급·현금) + 추가지출 − 추가수입 − 매입세액
 *  변동비율 = (수업료·성과급 + 카드수수료 + 매출세액) ÷ 매출
 */
function costSplit(s: SettlementResult): { fixedCosts: number; variableRatio: number | null } {
  const fixedCosts =
    s.fixed_total + s.salary_fixed + s.additional_total - s.additional_income_total - s.input_vat;
  if (s.total_revenue <= 0) return { fixedCosts, variableRatio: null };
  const variable = s.salary_variable + s.card_fee + s.output_vat;
  return { fixedCosts, variableRatio: variable / s.total_revenue };
}
function bepOf(fixedCosts: number, variableRatio: number | null): number | null {
  if (variableRatio == null || variableRatio >= 1) return null;
  return Math.max(0, Math.round(fixedCosts / (1 - variableRatio)));
}

export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  // 직급 권한 stats.business_summary (기본 대표자·관리자). owner 는 항상 허용.
  if (!(await ctxHasPermission(ctx, "stats.business_summary"))) {
    return NextResponse.json({ error: "경영 요약을 볼 권한이 없습니다" }, { status: 403 });
  }

  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();
  const currentYm = `${y}-${pad2(m)}`;

  const payload = await cached(crmCacheKey(ctx, "stats:business-summary", currentYm), 120, async () => {
    const yms = Array.from({ length: 12 }, (_, i) => shiftYm(y, m, i - 11));
    const results: SettlementResult[] = [];
    // DB 풀 과부하 방지: 3개월씩 병렬
    for (let i = 0; i < yms.length; i += 3) {
      const batch = await Promise.all(
        yms.slice(i, i + 3).map((ym) => computeSettlement(ctx.centerId, monthPeriod(ym)))
      );
      results.push(...batch);
    }
    const current = results[results.length - 1];
    const lastFull = results[results.length - 2];
    const fullMonths = results.slice(0, -1);
    const liability = await computeLiabilitySnapshot(ctx.centerId);

    // ── 손익분기점 ──
    const lastSplit = costSplit(lastFull);
    const lastBep = bepOf(lastSplit.fixedCosts, lastSplit.variableRatio);
    const lastBepRate = lastBep && lastBep > 0 ? lastFull.total_revenue / lastBep : null;
    // 이번 달은 초반 변동비율이 들쭉날쭉 → 직전 완료 월 변동비율 사용
    const curSplit = costSplit(current);
    const curBep = bepOf(curSplit.fixedCosts, lastSplit.variableRatio ?? curSplit.variableRatio);
    const curBepRate = curBep && curBep > 0 ? current.total_revenue / curBep : null;
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const elapsedRatio = Math.min(1, day / daysInMonth);
    const projectedRevenue = elapsedRatio > 0 ? Math.round(current.total_revenue / elapsedRatio) : null;

    // ── 평균 / 추세 ──
    const last3 = fullMonths.slice(-3);
    const prev3 = fullMonths.slice(-6, -3);
    const revenue3 = mean(last3.map((s) => s.total_revenue));
    const net3 = mean(last3.map((s) => s.net_profit));
    const prevNet3 = mean(prev3.map((s) => s.net_profit));
    const liabilityMonths = revenue3 > 0 ? liability.total / revenue3 : null;
    const activeFull = fullMonths.filter((s) => s.total_revenue > 0);
    const lossMonths = activeFull.filter((s) => s.net_profit < 0).length;

    // ── 안정성 신호 ──
    const signals: Signal[] = [];
    signals.push({
      key: "bep",
      label: "손익분기점 달성",
      status: lastBepRate == null ? "unknown" : lastBepRate >= 1.1 ? "good" : lastBepRate >= 1 ? "caution" : "risk",
      value_text: pctText(lastBepRate),
      detail:
        lastBep == null
          ? "매출이 없거나 변동비가 매출보다 커서 계산할 수 없어요."
          : `지난달 손익분기 매출 ${won(lastBep)} 대비 실제 매출 ${won(lastFull.total_revenue)}. 110% 이상이면 여유가 있어요.`,
    });
    signals.push({
      key: "margin",
      label: "순이익률",
      status:
        lastFull.net_margin == null ? "unknown" : lastFull.net_margin >= 0.15 ? "good" : lastFull.net_margin >= 0 ? "caution" : "risk",
      value_text: pctText(lastFull.net_margin),
      detail: "매출 중 남는 비율. 헬스장은 15% 이상이면 건강한 편이고, 0% 미만이면 적자예요.",
    });
    signals.push({
      key: "labor",
      label: "인건비 비중",
      status:
        lastFull.labor_ratio == null ? "unknown" : lastFull.labor_ratio <= 0.4 ? "good" : lastFull.labor_ratio <= 0.5 ? "caution" : "risk",
      value_text: pctText(lastFull.labor_ratio),
      detail: "매출 대비 직원 급여. 40% 이하가 일반적이고, 50%를 넘으면 수익 구조가 빠듯해요.",
    });
    signals.push({
      key: "liability",
      label: "선수금 부담",
      status: liabilityMonths == null ? "unknown" : liabilityMonths <= 2 ? "good" : liabilityMonths <= 4 ? "caution" : "risk",
      value_text: liabilityMonths == null ? "—" : `월매출 ${liabilityMonths.toFixed(1)}배`,
      detail: `아직 서비스로 갚지 않은 선수금 ${won(liability.total)}. 최근 3개월 평균 매출의 몇 배인지로 봐요. 4배를 넘으면 신규 매출이 끊겼을 때 버티기 어려워요.`,
    });
    signals.push({
      key: "loss",
      label: "최근 적자 월",
      status: activeFull.length === 0 ? "unknown" : lossMonths === 0 ? "good" : lossMonths <= 2 ? "caution" : "risk",
      value_text: activeFull.length === 0 ? "—" : `${lossMonths}개월 / ${activeFull.length}개월`,
      detail: "지난 11개월 중 순이익이 마이너스였던 달의 수예요.",
    });
    let trendStatus: Status = "unknown";
    let trendText = "—";
    if (prev3.length > 0 && last3.length > 0) {
      if (prevNet3 === 0) {
        trendStatus = net3 >= 0 ? "good" : "risk";
        trendText = net3 >= 0 ? "유지·개선" : "악화";
      } else {
        const change = (net3 - prevNet3) / Math.abs(prevNet3);
        trendStatus = change >= -0.05 ? "good" : change >= -0.2 ? "caution" : "risk";
        trendText = `${change >= 0 ? "+" : ""}${(change * 100).toFixed(0)}%`;
      }
    }
    signals.push({
      key: "trend",
      label: "순이익 추세",
      status: trendStatus,
      value_text: trendText,
      detail: `최근 3개월 평균 순이익 ${won(net3)} vs 그 전 3개월 ${won(prevNet3)}.`,
    });

    const risks = signals.filter((s) => s.status === "risk");
    const cautions = signals.filter((s) => s.status === "caution");
    const grade: "stable" | "caution" | "risk" =
      risks.length >= 2 ? "risk" : risks.length === 1 || cautions.length >= 2 ? "caution" : "stable";
    const gradeReason =
      risks.length + cautions.length === 0
        ? "주요 지표가 모두 양호해요."
        : [
            risks.length ? `위험: ${risks.map((s) => s.label).join(", ")}` : "",
            cautions.length ? `주의: ${cautions.map((s) => s.label).join(", ")}` : "",
          ]
            .filter(Boolean)
            .join(" · ");

    // ── 데이터 보완 경고 (틀린 결론 방지) ──
    const dataWarnings: string[] = [];
    if (lastFull.fixed_items <= 1) {
      dataWarnings.push(
        `고정 지출이 ${lastFull.fixed_items}건만 등록돼 있어요. 관리비·공과금·보험 등이 빠지면 순이익이 실제보다 크게 보여요.`
      );
    }
    if (current.card_fee_percent === 0 && results.some((s) => s.card_sales > 0)) {
      dataWarnings.push("카드 수수료율이 설정되지 않아 카드 수수료가 지출에서 빠져 있어요.");
    }
    if (fullMonths.reduce((s, x) => s + x.additional_total, 0) === 0) {
      dataWarnings.push(
        "최근 11개월 추가 지출(수리비·광고비·비품 등)이 0원이에요. 실제 지출이 있었다면 정산 탭에서 등록해 주세요."
      );
    }
    if (lastFull.total_revenue > 0 && lastFull.salary_total === 0) {
      dataWarnings.push("지난달 직원 급여가 0원으로 집계됐어요. 직원 관리의 급여·수업료 설정을 확인해 주세요.");
    }

    return {
      generated_at: new Date().toISOString(),
      current_ym: currentYm,
      last_full_ym: lastFull.ym,
      months: results.map((s) => ({
        ym: s.ym,
        revenue: s.total_revenue,
        expense: s.total_expense,
        net: s.net_profit,
      })),
      current: {
        revenue: current.total_revenue,
        expense: current.total_expense,
        net: current.net_profit,
        bep: curBep,
        bep_rate: curBepRate,
        elapsed_ratio: elapsedRatio,
        projected_revenue: projectedRevenue,
      },
      last_full: {
        revenue: lastFull.total_revenue,
        expense: lastFull.total_expense,
        net: lastFull.net_profit,
        net_margin: lastFull.net_margin,
        expense_ratio: lastFull.expense_ratio,
        labor_ratio: lastFull.labor_ratio,
        bep: lastBep,
        bep_rate: lastBepRate,
        breakdown: {
          fixed: lastFull.fixed_total,
          salary: lastFull.salary_total,
          vat_payable: lastFull.vat_payable,
          card_fee: lastFull.card_fee,
          additional: lastFull.additional_total,
          income: lastFull.additional_income_total,
        },
        mix: lastFull.revenue_mix,
      },
      liability: {
        total: liability.total,
        membership: liability.membership,
        pass: liability.pass,
        not_started: liability.not_started,
        in_progress: liability.in_progress,
        months_of_revenue: liabilityMonths,
      },
      averages: { revenue3, net3, prev_net3: prevNet3 },
      signals,
      grade,
      grade_reason: gradeReason,
      data_warnings: dataWarnings,
    };
  });

  return NextResponse.json(payload);
}
