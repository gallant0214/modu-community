import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { cached, crmCacheKey } from "@/app/lib/cache";

export const dynamic = "force-dynamic";

async function paginateAll<T>(
  build: (from: number, to: number) => { then: (fn: (r: unknown) => void) => unknown },
  chunk = 1000
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += chunk) {
    const to = from + chunk - 1;
    const res = (await build(from, to)) as { data: T[] | null; error: unknown };
    if (res.error) throw res.error;
    const rows = res.data ?? [];
    out.push(...rows);
    if (rows.length < chunk) break;
  }
  return out;
}

const AGE_BUCKETS = ["10대 이하", "20대", "30대", "40대", "50대", "60대 이상", "미등록"] as const;

function ageBucket(birth: string | null): (typeof AGE_BUCKETS)[number] {
  if (!birth || birth.length < 4) return "미등록";
  const year = Number(birth.slice(0, 4));
  if (!year) return "미등록";
  const kstYear = new Date(Date.now() + 9 * 3600 * 1000).getUTCFullYear();
  const age = kstYear - year;
  if (age < 20) return "10대 이하";
  if (age < 30) return "20대";
  if (age < 40) return "30대";
  if (age < 50) return "40대";
  if (age < 60) return "50대";
  return "60대 이상";
}

/**
 * GET /api/crm/dashboard/customer-status
 * 최근 12개월 고객 현황 시계열 (띠그래프용).
 * - validCount: 그 달에 유효 이용권(회원권+수강권)을 보유한 고객 수
 * - gender / age: 유효 고객의 성별·연령대 구성
 * - newMembership / newPass: 그 달 신규 발급 고객 수
 * - visited: 그 달 방문(출석) 고객 수
 * - churn: 마지막 이용권 만료가 그 달인(이탈) 고객 수
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "manager" });
  if (isCrmError(ctx)) return ctx;

  // 기간 옵션: 최근 1년(월,12) / 월단위(월,24) / 최근 30일(일,30) / 연단위(연,5)
  const period = new URL(request.url).searchParams.get("period") || "1y";
  const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
  const todayYmd = nowKst.toISOString().slice(0, 10);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);

  // months[i] = { ym(라벨키), start, endExcl } — 어떤 granularity든 동일 구조
  const months: { ym: string; start: string; endExcl: string }[] = [];
  if (period === "30d") {
    // 최근 30일 (일 단위)
    const base = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate()));
    for (let i = 29; i >= 0; i--) {
      const d = new Date(base);
      d.setUTCDate(d.getUTCDate() - i);
      const next = new Date(d);
      next.setUTCDate(next.getUTCDate() + 1);
      months.push({ ym: ymd(d), start: ymd(d), endExcl: ymd(next) });
    }
  } else if (period === "year") {
    // 연 단위 (최근 5년)
    for (let i = 4; i >= 0; i--) {
      const y = nowKst.getUTCFullYear() - i;
      months.push({
        ym: `${y}`,
        start: `${y}-01-01`,
        endExcl: `${y + 1}-01-01`,
      });
    }
  } else {
    // 월 단위: 최근 1년(12) / 월단위(24)
    const nMonths = period === "month" ? 24 : 12;
    for (let i = nMonths - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth() - i, 1));
      const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
      months.push({
        ym: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
        start: ymd(d),
        endExcl: ymd(next),
      });
    }
  }
  const windowStart = months[0].start;
  const windowEndExcl = months[months.length - 1].endExcl;

  try {
    // 고객현황 차트는 12~24개월 집계로 무거움 + 과거 데이터라 거의 안 바뀜 → 120초 캐시.
    const cacheKey = crmCacheKey(ctx, "dashboard:customer-status", `${period}:${todayYmd}`);
    const payload = await cached(cacheKey, 120, async () => {
    // 회원 성별·생년 (전체) — 유효 고객 구성 산출용
    const members = await paginateAll<{ id: number; gender: string | null; birth: string | null }>(
      (f, t) =>
        supabase
          .from("crm_members")
          .select("id, gender, birth")
          .eq("center_id", ctx.centerId)
          .neq("status", "deleted")
          .range(f, t)
    );
    const memberMap = new Map(members.map((m) => [m.id, m]));

    // 회원권 + 수강권 (윈도우와 겹치는 것 전부)
    const [memberships, passes] = await Promise.all([
      paginateAll<{ member_id: number; start_date: string | null; expires_at: string | null }>((f, t) =>
        supabase
          .from("crm_memberships")
          .select("member_id, start_date, expires_at")
          .eq("center_id", ctx.centerId)
          .neq("status", "deleted")
          .range(f, t)
      ),
      paginateAll<{ member_id: number; start_date: string | null; issued_at: string | null; expires_at: string | null }>((f, t) =>
        supabase
          .from("crm_passes")
          .select("member_id, start_date, issued_at, expires_at")
          .eq("center_id", ctx.centerId)
          .neq("status", "deleted")
          .range(f, t)
      ),
    ]);

    // 방문(출석) — 윈도우 내
    const attends = await paginateAll<{ member_id: number; checked_in_at: string }>((f, t) =>
      supabase
        .from("crm_attendances")
        .select("member_id, checked_in_at")
        .eq("center_id", ctx.centerId)
        .gte("checked_in_at", `${windowStart}T00:00:00+09:00`)
        .lt("checked_in_at", `${windowEndExcl}T00:00:00+09:00`)
        .range(f, t)
    );

    // 월별 유효 고객 집합 (회원권 보유 / 수강권 보유 분리)
    const mbSets = months.map(() => new Set<number>());
    const passSets = months.map(() => new Set<number>());
    const addTo = (
      sets: Set<number>[],
      memberId: number,
      start: string | null,
      expires: string | null
    ) => {
      const s = start ?? windowStart;
      if (!expires) return;
      for (let i = 0; i < months.length; i++) {
        // 겹침: start < monthEnd && expires >= monthStart
        if (s < months[i].endExcl && expires >= months[i].start) sets[i].add(memberId);
      }
    };
    for (const m of memberships) addTo(mbSets, m.member_id, m.start_date, m.expires_at);
    for (const p of passes) addTo(passSets, p.member_id, p.start_date ?? p.issued_at, p.expires_at);
    // 유효(합집합) — 성별·연령 구성 산출용
    const validSets = months.map((_, i) => new Set<number>([...mbSets[i], ...passSets[i]]));

    // 월별 발급 고객 — 상품별로 신규(첫 발급) vs 재등록(재발급) 분리
    const inMonth = (ymd: string | null): number => {
      if (!ymd) return -1;
      const d = ymd.slice(0, 10);
      return months.findIndex((mm) => d >= mm.start && d < mm.endExcl);
    };
    // 회원별 상품별 최초 발급일
    const mbFirst = new Map<number, string>();
    for (const m of memberships) {
      if (!m.start_date) continue;
      const s = m.start_date.slice(0, 10);
      const prev = mbFirst.get(m.member_id);
      if (!prev || s < prev) mbFirst.set(m.member_id, s);
    }
    const passFirst = new Map<number, string>();
    for (const p of passes) {
      const s = (p.start_date ?? p.issued_at)?.slice(0, 10);
      if (!s) continue;
      const prev = passFirst.get(p.member_id);
      if (!prev || s < prev) passFirst.set(p.member_id, s);
    }
    const newMembershipSets = months.map(() => new Set<number>());
    const reMembershipSets = months.map(() => new Set<number>());
    const newPassSets = months.map(() => new Set<number>());
    const rePassSets = months.map(() => new Set<number>());
    for (const m of memberships) {
      const idx = inMonth(m.start_date);
      if (idx < 0) continue;
      const s = m.start_date!.slice(0, 10);
      if (mbFirst.get(m.member_id) === s) newMembershipSets[idx].add(m.member_id);
      else reMembershipSets[idx].add(m.member_id);
    }
    for (const p of passes) {
      const raw = p.start_date ?? p.issued_at;
      const idx = inMonth(raw);
      if (idx < 0) continue;
      const s = raw!.slice(0, 10);
      if (passFirst.get(p.member_id) === s) newPassSets[idx].add(p.member_id);
      else rePassSets[idx].add(p.member_id);
    }

    // 신규 vs 재등록 (발급 기준): 회원의 최초 발급 = 신규, 이후 발급 = 재등록
    const allIssues: { member_id: number; start: string; expires: string | null }[] = [];
    for (const m of memberships) {
      if (m.start_date)
        allIssues.push({
          member_id: m.member_id,
          start: m.start_date.slice(0, 10),
          expires: m.expires_at ? m.expires_at.slice(0, 10) : null,
        });
    }
    for (const p of passes) {
      const s = p.start_date ?? p.issued_at;
      if (s)
        allIssues.push({
          member_id: p.member_id,
          start: s.slice(0, 10),
          expires: p.expires_at ? p.expires_at.slice(0, 10) : null,
        });
    }
    // 회원별 '첫 발급(신규)' 의 시작일 + 만료일
    const memberFirst = new Map<number, { start: string; expires: string | null }>();
    for (const it of allIssues) {
      const prev = memberFirst.get(it.member_id);
      if (!prev || it.start < prev.start) memberFirst.set(it.member_id, { start: it.start, expires: it.expires });
    }
    const newReg = months.map(() => 0);
    const reReg = months.map(() => 0);
    for (const it of allIssues) {
      const idx = months.findIndex((mm) => it.start >= mm.start && it.start < mm.endExcl);
      if (idx < 0) continue;
      if (memberFirst.get(it.member_id)?.start === it.start) newReg[idx] += 1;
      else reReg[idx] += 1;
    }

    // 재등록 여부: 첫 발급 이후 또 발급(재등록)이 있으면 전환
    const memberHasLater = new Map<number, boolean>();
    for (const it of allIssues) {
      const f = memberFirst.get(it.member_id);
      if (f && it.start > f.start) memberHasLater.set(it.member_id, true);
    }
    // 신규→재등록 전환률: 그 달에 '신규(첫) 회원권이 만료'된 회원 중 재등록한 비율
    //  - expireCohort[M] = 첫 회원권 만료월이 M 인 회원 수 (분모)
    //  - expireConverted[M] = 그 중 재등록한 회원 수 (분자)
    const expireCohort = months.map(() => 0);
    const expireConverted = months.map(() => 0);
    for (const [mid, f] of memberFirst) {
      if (!f.expires) continue;
      const idx = months.findIndex((mm) => f.expires! >= mm.start && f.expires! < mm.endExcl);
      if (idx < 0) continue;
      expireCohort[idx] += 1;
      if (memberHasLater.get(mid)) expireConverted[idx] += 1;
    }

    // 재등록→재등록 전환률: 그 달에 '재등록(2번째 이후) 이용권이 만료'된 건 중, 그 뒤 또 재등록한 비율
    //  - 회원별 발급을 시작일 순 정렬 → index 0=신규, 1이상=재등록
    //  - reExpireCohort[M] = 재등록 만료월이 M 인 재등록 건수 (분모)
    //  - reExpireConverted[M] = 그 재등록 이후 또 발급이 있는 건수 (분자)
    const issuesByMember = new Map<number, { start: string; expires: string | null }[]>();
    for (const it of allIssues) {
      const arr = issuesByMember.get(it.member_id) ?? [];
      arr.push({ start: it.start, expires: it.expires });
      issuesByMember.set(it.member_id, arr);
    }
    const reExpireCohort = months.map(() => 0);
    const reExpireConverted = months.map(() => 0);
    for (const [, arr] of issuesByMember) {
      arr.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
      for (let i = 1; i < arr.length; i++) {
        const e = arr[i].expires;
        if (!e) continue;
        const idx = months.findIndex((mm) => e >= mm.start && e < mm.endExcl);
        if (idx < 0) continue;
        reExpireCohort[idx] += 1;
        if (i + 1 < arr.length) reExpireConverted[idx] += 1;
      }
    }

    // 월별 방문 고객
    const visitedSets = months.map(() => new Set<number>());
    for (const a of attends) {
      const kst = new Date(new Date(a.checked_in_at).getTime() + 9 * 3600 * 1000);
      const ymd = kst.toISOString().slice(0, 10);
      const idx = months.findIndex((mm) => ymd >= mm.start && ymd < mm.endExcl);
      if (idx >= 0) visitedSets[idx].add(a.member_id);
    }

    // 이탈: 회원별 마지막 만료월 (그 이후 커버리지 없음 & 이미 만료)
    const lastExpiry = new Map<number, string>();
    const feed = (memberId: number, expires: string | null) => {
      if (!expires) return;
      const prev = lastExpiry.get(memberId);
      if (!prev || expires > prev) lastExpiry.set(memberId, expires);
    };
    for (const m of memberships) feed(m.member_id, m.expires_at);
    for (const p of passes) feed(p.member_id, p.expires_at);
    // 이탈 기준: 마지막 만료 후 7일 유예. 유예가 지난(만료+7일 < 오늘) 회원만,
    // '만료+7일' 시점이 속한 달에 이탈로 집계.
    const addDays = (ymd: string, n: number): string => {
      const d = new Date(`${ymd}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    const CHURN_GRACE_DAYS = 7;
    const churn = months.map(() => 0);
    for (const [, exp] of lastExpiry) {
      const churnDate = addDays(exp.slice(0, 10), CHURN_GRACE_DAYS);
      if (churnDate >= todayYmd) continue; // 만료 후 7일 안 지남 → 아직 이탈 아님
      const idx = months.findIndex((mm) => churnDate >= mm.start && churnDate < mm.endExcl);
      if (idx >= 0) churn[idx] += 1;
    }

    // 월별 성별·연령 구성
    const gender = { male: months.map(() => 0), female: months.map(() => 0), none: months.map(() => 0) };
    const age = Object.fromEntries(AGE_BUCKETS.map((b) => [b, months.map(() => 0)])) as Record<string, number[]>;
    validSets.forEach((set, i) => {
      for (const id of set) {
        const mem = memberMap.get(id);
        const g = mem?.gender;
        if (g === "M") gender.male[i] += 1;
        else if (g === "F") gender.female[i] += 1;
        else gender.none[i] += 1;
        age[ageBucket(mem?.birth ?? null)][i] += 1;
      }
    });

    return {
      months: months.map((m) => m.ym),
      validCount: validSets.map((s) => s.size),
      validMembership: mbSets.map((s) => s.size),
      validPass: passSets.map((s) => s.size),
      gender,
      ageBuckets: AGE_BUCKETS,
      age,
      newMembership: newMembershipSets.map((s) => s.size),
      reMembership: reMembershipSets.map((s) => s.size),
      newPass: newPassSets.map((s) => s.size),
      rePass: rePassSets.map((s) => s.size),
      newReg,
      reReg,
      expireCohort,
      expireConverted,
      reExpireCohort,
      reExpireConverted,
      visited: visitedSets.map((s) => s.size),
      churn,
    };
    });

    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json(
      { error: "조회 실패", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
