import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/member-app/passes?centerId=
 * 내 수강권 목록 (valid + expired, refunded/deleted 제외).
 *
 * 각 수강권에 대해:
 *  - 담당 트레이너 이름
 *  - 예약된 회차 수(reservedCount, 취소·거절 제외)
 *  - isPeriod: 기간제(total_sessions <= 0)
 *  - bookable: 예약 가능 여부 (valid + 미만료 + 잔여/기간 조건)
 *  - dday: 만료까지 남은 일수
 */
export async function GET(request: Request) {
  const centerId = Number(new URL(request.url).searchParams.get("centerId"));
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  const { data: passes, error } = await supabase
    .from("crm_passes")
    .select(
      "id, lesson_kind, issue_type, total_sessions, remaining_sessions, session_minutes, group_capacity, trainer_member_id, co_trainer_ids, issued_at, price_won, discount_won, start_date, expires_at, status"
    )
    .eq("center_id", ctx.centerId)
    .eq("member_id", ctx.memberId)
    .in("status", ["valid", "expired"])
    .order("status", { ascending: true })
    .order("expires_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  const list = passes ?? [];

  // 트레이너 이름
  const trainerIds = Array.from(new Set(list.map((p) => p.trainer_member_id)));
  const nameMap = new Map<number, string>();
  if (trainerIds.length) {
    const { data: staff } = await supabase
      .from("crm_center_members")
      .select("id, display_name")
      .in("id", trainerIds);
    for (const s of staff ?? []) nameMap.set(s.id, s.display_name || "트레이너");
  }

  // 예약된 회차 수 (취소·거절 제외)
  const passIds = list.map((p) => p.id);
  const reservedMap = new Map<number, number>();
  if (passIds.length) {
    const { data: rres } = await supabase
      .from("crm_reservations")
      .select("pass_id, status")
      .eq("center_id", ctx.centerId)
      .in("pass_id", passIds)
      .not("status", "in", "(cancelled,rejected)");
    for (const r of rres ?? []) {
      if (r.pass_id) reservedMap.set(r.pass_id, (reservedMap.get(r.pass_id) ?? 0) + 1);
    }
  }

  const todayYmd = new Date(new Date().getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  return NextResponse.json({
    passes: list.map((p) => {
      const isPeriod = (p.total_sessions ?? 0) <= 0;
      const reserved = reservedMap.get(p.id) ?? 0;
      const notExpired = p.status === "valid" && (p.expires_at ?? "") >= todayYmd;
      // 담당 강사 미배정이면 예약 불가 (배정 후에 예약 가능)
      const hasTrainer = !!p.trainer_member_id;
      const hasRoom = isPeriod ? true : reserved < (p.total_sessions ?? 0) && (p.remaining_sessions ?? 0) > 0;
      const dday = p.expires_at
        ? Math.ceil(
            (new Date(`${p.expires_at}T00:00:00+09:00`).getTime() -
              new Date(`${todayYmd}T00:00:00+09:00`).getTime()) /
              (24 * 3600 * 1000)
          )
        : null;
      return {
        id: p.id,
        lessonKind: p.lesson_kind,
        issueType: p.issue_type,
        totalSessions: p.total_sessions,
        remainingSessions: p.remaining_sessions,
        reservedCount: reserved,
        sessionMinutes: p.session_minutes,
        groupCapacity: p.group_capacity ?? 1,
        isPeriod,
        trainerId: p.trainer_member_id,
        trainerName: nameMap.get(p.trainer_member_id) ?? "트레이너",
        issuedAt: p.issued_at,
        priceWon: p.price_won ?? null,
        discountWon: p.discount_won ?? null,
        startDate: p.start_date,
        expiresAt: p.expires_at,
        dday,
        status: p.status,
        bookable: notExpired && hasRoom && hasTrainer,
      };
    }),
  });
}
