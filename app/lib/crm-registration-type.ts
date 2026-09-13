import { supabase } from "@/app/lib/supabase";

/**
 * 회원의 신규/재등록 구분(`crm_members.registration_type`) 자동 갱신.
 *
 * 기준(사용자 정의): 처음 산 사람 = 신규 / 이미 산 적 있는 사람의 추가 구매 = 재등록.
 * 회원권·수강권·대여권 발급 직후 호출한다.
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

    // 구매 이력 = 회원권 + 수강권 + 대여권. 이번 발급분 포함해서 2건 이상이면 재등록.
    const counts = await Promise.all(
      (["crm_memberships", "crm_passes", "crm_rentals"] as const).map(async (table) => {
        const { count } = await supabase
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("center_id", centerId)
          .eq("member_id", memberId);
        return count ?? 0;
      })
    );
    const total = counts.reduce((a, b) => a + b, 0);
    if (total <= 1) return;

    await supabase
      .from("crm_members")
      .update({ registration_type: "재등록" } as never)
      .eq("id", memberId)
      .eq("center_id", centerId);
  } catch (e) {
    console.error("[registration-type] sync error", memberId, e);
  }
}
