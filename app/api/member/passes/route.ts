import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberContext, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/member/passes
 * 회원 본인의 유효 수강권 목록 — 예약 화면에서 "어떤 수강권으로 예약할지" 선택용.
 *
 * 잔여 세션(remaining_sessions) 있고 status='valid' 이며 만료 전인 것만.
 * 각 수강권의 담당 트레이너 이름도 함께 반환.
 */
export async function GET(request: Request) {
  const ctx = await requireMemberContext(request);
  if (isMemberError(ctx)) return ctx;

  const today = new Date().toISOString().slice(0, 10);

  const { data: passes, error } = await supabase
    .from("crm_passes")
    .select(
      "id, lesson_kind, total_sessions, remaining_sessions, session_minutes, trainer_member_id, co_trainer_ids, start_date, expires_at, status"
    )
    .eq("center_id", ctx.centerId)
    .eq("member_id", ctx.memberId)
    .eq("status", "valid")
    .gt("remaining_sessions", 0)
    .gte("expires_at", today)
    .order("expires_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  // 담당 트레이너 이름 join (주강사 + 추가강사)
  const trainerIds = Array.from(
    new Set(
      (passes ?? []).flatMap((p) => [
        p.trainer_member_id,
        ...(Array.isArray(p.co_trainer_ids) ? (p.co_trainer_ids as number[]) : []),
      ])
    )
  ).filter((v): v is number => !!v);

  const nameMap = new Map<number, string>();
  if (trainerIds.length > 0) {
    const { data: staff } = await supabase
      .from("crm_center_members")
      .select("id, display_name")
      .in("id", trainerIds);
    for (const s of staff ?? []) {
      nameMap.set(s.id, s.display_name || "트레이너");
    }
  }

  return NextResponse.json({
    passes: (passes ?? []).map((p) => ({
      id: p.id,
      lessonKind: p.lesson_kind,
      totalSessions: p.total_sessions,
      remainingSessions: p.remaining_sessions,
      sessionMinutes: p.session_minutes,
      trainerId: p.trainer_member_id,
      trainerName: nameMap.get(p.trainer_member_id) ?? "트레이너",
      startDate: p.start_date,
      expiresAt: p.expires_at,
    })),
  });
}
