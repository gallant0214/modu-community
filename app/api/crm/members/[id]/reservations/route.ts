import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/members/[id]/reservations?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * 이 회원의 전체 예약 내역 (기간 지정 안 하면 전체).
 * 강사 이름·수강권 요약 join.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const memberId = Number(id);
  if (!memberId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  let q = supabase
    .from("crm_reservations")
    .select(
      "id, pass_id, member_id, trainer_member_id, starts_at, ends_at, status, consumed, attended_at, cancelled_at, cancelled_reason"
    )
    .eq("center_id", ctx.centerId)
    .eq("member_id", memberId)
    .order("starts_at", { ascending: false })
    .limit(500);

  if (from) q = q.gte("starts_at", `${from}T00:00:00+09:00`);
  if (to) {
    // to 포함 (다음 날 00시 미만)
    const nextDay = new Date(`${to}T00:00:00+09:00`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    q = q.lt("starts_at", nextDay.toISOString());
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  // trainer 이름 · pass 정보 join
  const trainerIds = Array.from(new Set((data ?? []).map((r) => r.trainer_member_id)));
  const passIds = Array.from(new Set((data ?? []).map((r) => r.pass_id).filter(Boolean)));

  const [trainerRes, passRes] = await Promise.all([
    trainerIds.length
      ? supabase.from("crm_center_members").select("id, display_name").in("id", trainerIds)
      : Promise.resolve({ data: [] as { id: number; display_name: string }[] }),
    passIds.length
      ? supabase
          .from("crm_passes")
          .select("id, lesson_kind, session_minutes")
          .in("id", passIds as number[])
      : Promise.resolve({
          data: [] as { id: number; lesson_kind: string; session_minutes: number }[],
        }),
  ]);
  const trainerMap = new Map((trainerRes.data ?? []).map((t) => [t.id, t.display_name]));
  const passMap = new Map(
    (passRes.data ?? []).map((p) => [p.id, { lesson_kind: p.lesson_kind, session_minutes: p.session_minutes }])
  );

  return NextResponse.json({
    reservations: (data ?? []).map((r) => ({
      ...r,
      trainer_name: trainerMap.get(r.trainer_member_id) ?? null,
      pass: r.pass_id ? passMap.get(r.pass_id) ?? null : null,
    })),
  });
}
