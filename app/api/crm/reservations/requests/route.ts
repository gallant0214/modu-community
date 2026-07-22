import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/reservations/requests
 * 회원 앱에서 들어온 승인 대기(status='requested') 예약요청 목록.
 * trainer 는 본인 담당만, manager 이상은 전체(옵션 trainer_id 필터).
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  let query = supabase
    .from("crm_reservations")
    .select("id, pass_id, member_id, trainer_member_id, starts_at, ends_at, requested_at")
    .eq("center_id", ctx.centerId)
    .eq("status", "requested")
    .order("starts_at", { ascending: true });

  if (ctx.role === "trainer") {
    query = query.eq("trainer_member_id", ctx.centerMemberId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  const memberIds = Array.from(new Set((data ?? []).map((r) => r.member_id)));
  const trainerIds = Array.from(new Set((data ?? []).map((r) => r.trainer_member_id)));
  const passIds = Array.from(new Set((data ?? []).map((r) => r.pass_id).filter(Boolean)));

  const [{ data: members }, { data: trainers }, { data: passes }] = await Promise.all([
    memberIds.length
      ? supabase.from("crm_members").select("id, name, phone").in("id", memberIds)
      : Promise.resolve({ data: [] }),
    trainerIds.length
      ? supabase.from("crm_center_members").select("id, display_name").in("id", trainerIds)
      : Promise.resolve({ data: [] }),
    passIds.length
      ? supabase.from("crm_passes").select("id, lesson_kind, remaining_sessions").in("id", passIds as number[])
      : Promise.resolve({ data: [] }),
  ]);
  const memberMap = new Map((members ?? []).map((m) => [m.id, m]));
  const trainerMap = new Map((trainers ?? []).map((t) => [t.id, t.display_name]));
  const passMap = new Map((passes ?? []).map((p) => [p.id, p]));

  return NextResponse.json({
    requests: (data ?? []).map((r) => {
      const m = memberMap.get(r.member_id);
      const p = r.pass_id ? passMap.get(r.pass_id) : null;
      return {
        id: r.id,
        memberId: r.member_id,
        memberName: m?.name ?? "",
        memberPhone: m?.phone ?? "",
        trainerId: r.trainer_member_id,
        trainerName: trainerMap.get(r.trainer_member_id) ?? "",
        passId: r.pass_id,
        lessonKind: p?.lesson_kind ?? "",
        remainingSessions: p?.remaining_sessions ?? null,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        requestedAt: r.requested_at,
      };
    }),
  });
}
