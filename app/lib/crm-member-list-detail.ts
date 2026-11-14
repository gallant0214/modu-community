import "server-only";
import { supabase } from "./supabase";

/**
 * 회원 목록 상세(`/api/crm/members?detail=1`) 보강 — 이용 가능 상품·홀딩·예정·최근 출석·최근 구매·누적 결제.
 * 🚨 CRM 회원 목록과 외부 연동 API(/api/open/v1/members)가 같은 값을 내도록 여기 한 곳에만 둔다.
 *
 * @param opts.centerIds    이용권·결제 등을 모을 센터들(개인 CRM 은 다른 센터 담당 회원 포함)
 * @param opts.holdCenterId 홀딩(crm_pauses) 판정 센터 — 지금 보고 있는 센터
 */
export type MemberDetailBase = {
  id: number;
  first_use_at: string | null;
  last_attended_at: string | null;
  last_purchase_at: string | null;
  total_paid_won: number;
};

export async function enrichMemberListDetail<T extends MemberDetailBase>(
  members: T[],
  opts: { centerIds: number[]; holdCenterId: number }
) {
  const { centerIds } = opts;
  const ids = members.map((m) => m.id);

  // 회원 수가 많으면(예: 수천 명) .in() 에 전체 id 를 넣으면 URL 길이 초과가 날 수 있어
  // 500개 단위로 쪼개서 조회 후 합친다.
  const CHUNK = 500;
  const idChunks: number[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) idChunks.push(ids.slice(i, i + CHUNK));

  const gather = async <T>(
    run: (chunk: number[]) => PromiseLike<{ data: unknown[] | null }>
  ): Promise<T[]> => {
    const results = await Promise.all(idChunks.map((c) => run(c)));
    return results.flatMap((r) => (r.data ?? []) as T[]);
  };

  // 활성 수강권 + 활성 회원권 + 락커 배정 + 최근 출석
  const [passesData, mbData, lockersData, msStartData, psStartData, attData] = await Promise.all([
    gather<{
      member_id: number;
      lesson_kind: string;
      remaining_sessions: number | null;
      total_sessions: number;
      expires_at: string;
      start_date: string | null;
      is_paused: boolean;
      outstanding_won: number | null;
      payment_status: string | null;
    }>(
      (c) =>
        supabase
          .from("crm_passes")
          .select("member_id, lesson_kind, remaining_sessions, total_sessions, expires_at, start_date, is_paused, outstanding_won, payment_status")
          .in("center_id", centerIds)
          .in("member_id", c)
          .eq("status", "valid")
    ),
    gather<{
      member_id: number;
      plan_name: string;
      expires_at: string;
      start_date: string | null;
      is_paused: boolean;
      outstanding_won: number | null;
      payment_status: string | null;
    }>((c) =>
      supabase
        .from("crm_memberships")
        .select("member_id, plan_name, expires_at, start_date, is_paused, outstanding_won, payment_status")
        .in("center_id", centerIds)
        .in("member_id", c)
        .eq("status", "valid")
    ),
    gather<{ assigned_member_id: number | null; number: number; zone_id: number; crm_locker_zones: { name?: string } | { name?: string }[] | null }>(
      (c) =>
        supabase
          .from("crm_lockers")
          .select("assigned_member_id, number, zone_id, crm_locker_zones(name)")
          .in("center_id", centerIds)
          .in("assigned_member_id", c)
    ),
    // 이용 시작일 실측용 — 만료분까지 포함한 모든 회원권·수강권의 시작일(환불 제외)
    gather<{ member_id: number; start_date: string | null }>((c) =>
      supabase
        .from("crm_memberships")
        .select("member_id, start_date")
        .in("center_id", centerIds)
        .in("member_id", c)
        .neq("status", "refunded")
        .not("start_date", "is", null)
    ),
    gather<{ member_id: number; start_date: string | null }>((c) =>
      supabase
        .from("crm_passes")
        .select("member_id, start_date")
        .in("center_id", centerIds)
        .in("member_id", c)
        .neq("status", "refunded")
        .not("start_date", "is", null)
    ),
    gather<{ member_id: number; checked_in_at: string }>((c) =>
      supabase
        .from("crm_attendances")
        .select("member_id, checked_in_at")
        .in("center_id", centerIds)
        .in("member_id", c)
        .order("checked_in_at", { ascending: false })
        .limit(2000)
    ),
  ]);

  // KST 오늘 (예정 판정용)
  const todayKstYmd = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  // 🚨 홀딩 판정은 is_paused 플래그가 아니라 **실제 홀딩 기간(crm_pauses)** 기준.
  //    회원 상세 칩·대시보드와 같은 규칙으로 맞춘다. 플래그만 남은 이관분 때문에
  //    목록은 '홀딩' 인데 상세엔 칩이 없는 불일치가 있었다(김민규 회원 사례).
  const holdSet = new Set<number>(); // 오늘이 홀딩 기간 안인 회원
  const hasActiveSet = new Set<number>(); // 지금 이용중(시작함 & 만료 전)인 이용권 보유 회원
  const hasFutureSet = new Set<number>(); // 시작일이 미래인(아직 시작 안 함) 이용권 보유 회원

  // 유효 이용권 1건을 사람별 활성/미래/홀딩 집합에 반영
  const classify = (memberId: number, startDate: string | null, expires: string, _paused: boolean) => {
    if (startDate && startDate > todayKstYmd) {
      hasFutureSet.add(memberId); // 아직 시작 안 함
    } else if (!expires || expires >= todayKstYmd) {
      hasActiveSet.add(memberId); // 시작됨(또는 시작일 없음) & 만료 전 → 현재 이용중
    }
  };

  const passMap = new Map<number, { kind: string; type: "lesson" | "membership"; remaining: number | null; expires: string }[]>();
  const outstandingMap = new Map<number, number>();
  const feedOutstanding = (memberId: number, amount: number | null, paymentStatus: string | null) => {
    const won = Math.max(0, Number(amount) || 0);
    if (won <= 0 && paymentStatus !== "unpaid" && paymentStatus !== "partial") return;
    outstandingMap.set(memberId, (outstandingMap.get(memberId) ?? 0) + won);
  };
  // 오늘이 홀딩 기간 안인 회원 (crm_pauses 기준) — 상세 칩·대시보드와 동일
  {
    const { data: activePauses } = await supabase
      .from("crm_pauses")
      .select("member_id")
      .eq("center_id", opts.holdCenterId)
      .eq("status", "active")
      .lte("start_date", todayKstYmd)
      .gte("end_date", todayKstYmd);
    for (const r of (activePauses ?? []) as { member_id: number }[]) holdSet.add(r.member_id);
  }

  for (const p of passesData) {
    // 횟수제 수강권이 모두 소진(출석완료)됐으면 '이용 가능 상품'에서 제외.
    // (기간제(total_sessions<=0)는 잔여 개념이 없어 그대로 표시)
    const isCount = (p.total_sessions ?? 0) > 0;
    const usedUp = isCount && (p.remaining_sessions ?? 0) <= 0;
    // 이용기간이 지난(만료) 상품은 '이용 가능 상품'에서 제외
    const expired = !!p.expires_at && p.expires_at < todayKstYmd;
    if (!usedUp) {
      if (!expired) {
        const arr = passMap.get(p.member_id) ?? [];
        arr.push({
          kind: p.lesson_kind,
          type: "lesson",
          remaining: p.remaining_sessions ?? null,
          expires: p.expires_at,
        });
        passMap.set(p.member_id, arr);
      }
      classify(p.member_id, p.start_date, p.expires_at, p.is_paused);
    }
    feedOutstanding(p.member_id, p.outstanding_won, p.payment_status);
  }
  for (const m of mbData) {
    // 이용기간이 지난(만료) 회원권은 '이용 가능 상품'에서 제외
    const expired = !!m.expires_at && m.expires_at < todayKstYmd;
    if (!expired) {
      const arr = passMap.get(m.member_id) ?? [];
      arr.push({
        kind: m.plan_name,
        type: "membership",
        remaining: null,
        expires: m.expires_at,
      });
      passMap.set(m.member_id, arr);
    }
    classify(m.member_id, m.start_date, m.expires_at, m.is_paused);
    feedOutstanding(m.member_id, m.outstanding_won, m.payment_status);
  }

  const lockerMap = new Map<number, string>();
  for (const l of lockersData) {
    if (l.assigned_member_id) {
      const zone = l.crm_locker_zones;
      const zoneName = Array.isArray(zone) ? zone[0]?.name : zone?.name;
      lockerMap.set(l.assigned_member_id, `${zoneName ?? "락커"} ${l.number}번`);
    }
  }

  // 청크 간 순서가 보장되지 않으므로 회원별 최대(최근) 값으로 계산
  const lastVisitMap = new Map<number, string>();
  for (const a of attData) {
    const prev = lastVisitMap.get(a.member_id);
    if (!prev || a.checked_in_at > prev) lastVisitMap.set(a.member_id, a.checked_in_at);
  }

  // 최근 구매일 = 결제(crm_payments) 최신 paid_at(KST 날짜). 발급 시 자동 갱신이 없던
  // last_purchase_at 컬럼 대신 실제 결제 기록으로 계산(없으면 기존 컬럼값 유지).
  const paymentsData = await gather<{ member_id: number; paid_at: string; amount_won: number; status: string }>((c) =>
    supabase
      .from("crm_payments")
      .select("member_id, paid_at, amount_won, status")
      .in("center_id", centerIds)
      .in("member_id", c)
  );
  const lastPurchaseMap = new Map<number, string>();
  for (const p of paymentsData) {
    if (!p.member_id || !p.paid_at) continue;
    const ymd = new Date(new Date(p.paid_at).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const prev = lastPurchaseMap.get(p.member_id);
    if (!prev || ymd > prev) lastPurchaseMap.set(p.member_id, ymd);
  }

  // 누적 결제 = crm_sales 원장(BROJ 임포트) + 원장 컷오프 이후 crm_payments.
  //   total_paid_won 스냅샷 컬럼이 대부분 0(미갱신)이라, center-revenue 와 동일한
  //   either/or 규칙으로 실제 결제 기록에서 계산해 표시(이중집계 방지).
  //   컷오프 = crm_sales 마지막 거래일(KST). 원장 없으면 crm_payments 전체 합산.
  const { data: maxTxRow } = await supabase
    .from("crm_sales")
    .select("tx_at")
    .in("center_id", centerIds)
    .order("tx_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const salesCutoffYmd = (maxTxRow as { tx_at?: string } | null)?.tx_at
    ? new Date(new Date((maxTxRow as { tx_at: string }).tx_at).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
    : null;
  // crm_sales 회원별 순액(판매/미수금결제 +, 환불 −)
  const salesData = await gather<{ member_id: number; amount_won: number; tx_type: string }>((c) =>
    supabase.from("crm_sales").select("member_id, amount_won, tx_type").in("center_id", centerIds).in("member_id", c)
  );
  const salesNetMap = new Map<number, number>();
  for (const s of salesData) {
    if (!s.member_id) continue;
    const signed = s.tx_type === "환불" ? -(s.amount_won ?? 0) : s.amount_won ?? 0;
    salesNetMap.set(s.member_id, (salesNetMap.get(s.member_id) ?? 0) + signed);
  }
  // crm_payments 중 컷오프 이후(원장 없으면 전체) 완료 결제 합
  const paidAfterCutoffMap = new Map<number, number>();
  for (const p of paymentsData) {
    if (!p.member_id || p.status !== "completed") continue;
    if (salesCutoffYmd) {
      const ymd = p.paid_at ? new Date(new Date(p.paid_at).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10) : null;
      if (!ymd || ymd <= salesCutoffYmd) continue; // 컷오프 이전은 원장에 이미 포함
    }
    paidAfterCutoffMap.set(p.member_id, (paidAfterCutoffMap.get(p.member_id) ?? 0) + (p.amount_won ?? 0));
  }

  // 회원별 가장 이른 이용 시작일
  const firstUseMap = new Map<number, string>();
  for (const r of [...(msStartData ?? []), ...(psStartData ?? [])]) {
    if (!r.start_date) continue;
    const ymd = r.start_date.slice(0, 10);
    const prev = firstUseMap.get(r.member_id);
    if (!prev || ymd < prev) firstUseMap.set(r.member_id, ymd);
  }

  const enriched = members.map((m) => {
    const items = passMap.get(m.id) ?? [];
    const maxExpires = items.reduce<string | null>(
      (acc, x) => (!acc || x.expires > acc ? x.expires : acc),
      null
    );
    return {
      ...m,
      items,
      locker_label: lockerMap.get(m.id) ?? null,
      last_visit_at: lastVisitMap.get(m.id) ?? null,
      // 마지막 출석일 = 실제 출석기록(crm_attendances) 최신일(KST). 스냅샷 컬럼은 자동
      // 갱신이 안 돼 비어 있으므로, 실측을 우선하고 없으면 기존 컬럼값 유지.
      last_attended_at: (() => {
        const lv = lastVisitMap.get(m.id);
        return lv
          ? new Date(new Date(lv).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
          : m.last_attended_at ?? null;
      })(),
      // 결제 기록 기반 최근 구매일(없으면 기존 컬럼값)
      last_purchase_at: lastPurchaseMap.get(m.id) ?? m.last_purchase_at,
      // 이용 시작일 = 회원권·수강권 중 가장 이른 시작일과 저장된 컬럼값 중 **더 이른 날짜**.
      // (이관 회원은 이용권 기록보다 앞선 최초 이용일이 컬럼에만 있어 덮으면 밀린다) 상세와 동일 규칙.
      first_use_at: (() => {
        const calc = firstUseMap.get(m.id) ?? null;
        const stored = m.first_use_at ? m.first_use_at.slice(0, 10) : null;
        if (calc && stored) return calc < stored ? calc : stored;
        return calc ?? stored;
      })(),
      // 누적 결제: 원장 순액 + 컷오프 이후 결제(계산값). 계산이 0 이하이면 스냅샷 컬럼 폴백.
      total_paid_won: (() => {
        const computed = (salesNetMap.get(m.id) ?? 0) + (paidAfterCutoffMap.get(m.id) ?? 0);
        return computed > 0 ? computed : m.total_paid_won ?? 0;
      })(),
      max_expires_at: maxExpires,
      on_hold: holdSet.has(m.id),
      outstanding_won: outstandingMap.get(m.id) ?? 0,
      // 예정 = 미래 시작 이용권이 있고, 지금 이용중인 이용권은 없는 회원
      scheduled: hasFutureSet.has(m.id) && !hasActiveSet.has(m.id),
    };
  });

  return enriched;
}
