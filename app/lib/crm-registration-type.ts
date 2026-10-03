import { supabase } from "@/app/lib/supabase";

/**
 * 회원의 신규/재등록 구분(`crm_members.registration_type`) 자동 갱신.
 *
 * 기준(사용자 정의): **이용권(회원권) + 수강권의 '등록 횟수'** 로 판정한다.
 *   - 같은 결제로 함께 산 건(묶음·장바구니, created_at ±3초)은 **한 번의 등록**으로 본다.
 *     예) 첫 등록 때 수강권+회원권 묶음 → 신규 / 회원권+운동복+락커 → 신규
 *   - 그 뒤에 회원권이든 수강권이든 **따로 한 번 더 사면 재등록**.
 *     예) 수강권만 있다가 수강권 재구매 → 재등록 / 수강권 뒤 회원권 구매 → 재등록
 *   - 락커·운동복 등 대여권은 몇 건을 사도 판정에 넣지 않는다.
 * 회원권·수강권 발급 직후에 호출한다.
 *
 * 🚨 '신규 → 재등록' 방향으로만 올린다. 반대로 내리지 않는 이유:
 *    POS(BROJ) 시절 구매 이력이 CRM 테이블에 없는 회원이 있어(수기/임포트 누락),
 *    구매 건수만 보고 '재등록 → 신규' 로 되돌리면 멀쩡한 값을 망가뜨린다.
 *
 * 발송 실패가 발급 자체를 막으면 안 되므로 예외를 던지지 않는다.
 */
export async function syncRegistrationType(centerId: number, memberId: number): Promise<void> {
  try {
    if (!centerId || !memberId) return;

    const { data: member } = await supabase
      .from("crm_members")
      .select("registration_type")
      .eq("id", memberId)
      .eq("center_id", centerId)
      .maybeSingle();
    const cur = (member as { registration_type?: string | null } | null)?.registration_type ?? null;
    if ((cur ?? "").trim() === "재등록") return; // 이미 재등록이면 건드릴 것 없음

    // 회원권 + 수강권의 발급 시각을 모아 '등록 횟수' 를 센다.
    // 같은 결제(묶음·장바구니)는 시각이 거의 같으므로 3초 이내면 한 번으로 묶는다.
    const [{ data: ms }, { data: ps }] = await Promise.all([
      supabase
        .from("crm_memberships")
        .select("created_at")
        .eq("center_id", centerId)
        .eq("member_id", memberId),
      supabase
        .from("crm_passes")
        .select("created_at")
        .eq("center_id", centerId)
        .eq("member_id", memberId),
    ]);
    const times = [...(ms ?? []), ...(ps ?? [])]
      .map((r) => Date.parse((r as { created_at: string }).created_at))
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => a - b);
    if (times.length <= 1) return;

    const BUNDLE_WINDOW_MS = 3000; // 결제 삭제·묶음 판정과 같은 기준
    let events = 1;
    for (let i = 1; i < times.length; i++) {
      if (times[i] - times[i - 1] > BUNDLE_WINDOW_MS) events += 1;
    }
    if (events <= 1) return;

    await supabase
      .from("crm_members")
      .update({ registration_type: "재등록" } as never)
      .eq("id", memberId)
      .eq("center_id", centerId);
  } catch (e) {
    console.error("[registration-type] sync error", memberId, e);
  }
}

/**
 * 회원의 등록일 스냅샷 갱신 — 회원권·수강권 발급 직후에 호출.
 *
 * 🚨 두 날짜의 의미가 다르다(2026-10-03 사용자 확정):
 *   - `registered_at`       = **최근 등록일** (가장 최근에 회원권/수강권을 등록한 날)
 *   - `first_registered_at` = **최초 등록일** — 대시보드 신규/재등록 집계 기준.
 *     registered_at 이 최근 날짜로 움직이므로, 집계는 반드시 이 컬럼을 봐야 한다.
 *   - `last_purchase_at`    = 마지막 결제일(완료 결제 기준)
 * 대여권(운동복·락커)은 '등록' 판정에 넣지 않는다(registration_type 과 동일 기준).
 *
 * 발급 자체를 막지 않도록 예외를 던지지 않는다.
 */
export async function syncMemberRegistrationDates(centerId: number, memberId: number): Promise<void> {
  try {
    if (!centerId || !memberId) return;

    const [{ data: member }, { data: ms }, { data: ps }, { data: pays }] = await Promise.all([
      supabase
        .from("crm_members")
        .select("registered_at, first_registered_at, last_purchase_at")
        .eq("id", memberId)
        .eq("center_id", centerId)
        .maybeSingle(),
      supabase
        .from("crm_memberships")
        .select("purchased_at, start_date")
        .eq("center_id", centerId)
        .eq("member_id", memberId)
        .neq("status", "deleted"),
      supabase
        .from("crm_passes")
        .select("issued_at, start_date")
        .eq("center_id", centerId)
        .eq("member_id", memberId)
        .neq("status", "deleted"),
      supabase
        .from("crm_payments")
        .select("paid_at")
        .eq("center_id", centerId)
        .eq("member_id", memberId)
        .eq("status", "completed"),
    ]);
    if (!member) return;
    const cur = member as {
      registered_at: string | null;
      first_registered_at: string | null;
      last_purchase_at: string | null;
    };

    const regDates = [
      ...((ms ?? []) as { purchased_at: string | null; start_date: string | null }[]).map(
        (m) => m.purchased_at ?? m.start_date
      ),
      ...((ps ?? []) as { issued_at: string | null; start_date: string | null }[]).map(
        (p) => p.issued_at ?? p.start_date
      ),
    ]
      .filter((v): v is string => !!v)
      .map((v) => v.slice(0, 10));

    const payDates = ((pays ?? []) as { paid_at: string | null }[])
      .map((p) => p.paid_at)
      .filter((v): v is string => !!v)
      // paid_at 은 timestamptz → KST 날짜로 환산
      .map((v) => new Date(new Date(v).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10));

    const patch: Record<string, string> = {};
    if (regDates.length > 0) {
      const latest = regDates.reduce((a, b) => (b > a ? b : a));
      const earliest = regDates.reduce((a, b) => (b < a ? b : a));
      if (latest !== cur.registered_at) patch.registered_at = latest;
      // 최초 등록일은 더 이른 날짜로만 내려간다(이관·수기로 들어온 과거 값 보존)
      const firstKnown = [cur.first_registered_at, cur.registered_at, earliest]
        .filter((v): v is string => !!v)
        .reduce((a, b) => (b < a ? b : a));
      if (firstKnown !== cur.first_registered_at) patch.first_registered_at = firstKnown;
    }
    if (payDates.length > 0) {
      const lastPay = payDates.reduce((a, b) => (b > a ? b : a));
      if (lastPay !== cur.last_purchase_at) patch.last_purchase_at = lastPay;
    }
    if (Object.keys(patch).length === 0) return;

    await supabase
      .from("crm_members")
      .update(patch as never)
      .eq("id", memberId)
      .eq("center_id", centerId);
  } catch (e) {
    console.error("[registration-dates] sync error", memberId, e);
  }
}
