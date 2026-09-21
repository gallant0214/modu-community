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
