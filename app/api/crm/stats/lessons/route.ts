import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/stats/lessons?from=YYYY-MM-DD&to=YYYY-MM-DD&trainer_id=
 * 센터에서 '진행된 수업' 목록. 진행분 = 출석완료(attended) + 노쇼(noshow).
 * (둘 다 회차 차감되는 '수업 진행'으로 처리)
 * 날짜는 KST 기준. trainer_id 없으면 전체 강사.
 * 데이터 격리: owner/admin/solo 만 전체·타강사 조회, 그 외는 본인 담당분만.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const from = (url.searchParams.get("from") || "").slice(0, 10);
  const to = (url.searchParams.get("to") || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "기간을 선택해 주세요" }, { status: 400 });
  }

  // KST 날짜 범위 → UTC (to 당일 포함)
  const fromUtc = new Date(`${from}T00:00:00+09:00`).toISOString();
  const toEnd = new Date(`${to}T00:00:00+09:00`);
  toEnd.setUTCDate(toEnd.getUTCDate() + 1);
  const toUtc = toEnd.toISOString();

  // 강사 필터 + 격리
  const isFullView = ctx.role === "owner" || ctx.role === "admin" || ctx.isSoloOwner;
  const reqTrainer = Number(url.searchParams.get("trainer_id")) || 0;
  let trainerFilter = 0;
  if (isFullView) {
    trainerFilter = reqTrainer; // 0 = 전체
  } else {
    trainerFilter = ctx.centerMemberId ?? -1; // 본인 담당만
  }

  let q = supabase
    .from("crm_reservations")
    .select("id, starts_at, status, member_id, trainer_member_id, pass_id")
    .eq("center_id", ctx.centerId)
    // 진행분(출석·노쇼) + 예약(확정) 전체. 취소·거절·요청대기 제외.
    .in("status", ["booked", "attended", "noshow"])
    .gte("starts_at", fromUtc)
    .lt("starts_at", toUtc)
    .order("starts_at", { ascending: true })
    .limit(5000);
  if (trainerFilter > 0) q = q.eq("trainer_member_id", trainerFilter);

  const { data: rows, error } = await q;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  const list = (rows ?? []) as {
    id: number;
    starts_at: string;
    status: string;
    member_id: number;
    trainer_member_id: number;
    pass_id: number | null;
  }[];

  // 이름·수업명 배치 조회
  const memberIds = Array.from(new Set(list.map((r) => r.member_id).filter(Boolean)));
  const trainerIds = Array.from(new Set(list.map((r) => r.trainer_member_id).filter(Boolean)));
  const passIds = Array.from(new Set(list.map((r) => r.pass_id).filter((v): v is number => !!v)));

  const [membersRes, trainersRes, passesRes] = await Promise.all([
    memberIds.length
      ? supabase.from("crm_members").select("id, name, phone").eq("center_id", ctx.centerId).in("id", memberIds)
      : Promise.resolve({ data: [] as { id: number; name: string; phone: string | null }[] }),
    trainerIds.length
      ? supabase.from("crm_center_members").select("id, display_name").eq("center_id", ctx.centerId).in("id", trainerIds)
      : Promise.resolve({ data: [] as { id: number; display_name: string }[] }),
    passIds.length
      ? supabase.from("crm_passes").select("id, lesson_kind").eq("center_id", ctx.centerId).in("id", passIds)
      : Promise.resolve({ data: [] as { id: number; lesson_kind: string }[] }),
  ]);

  const memberMap = new Map(
    ((membersRes.data ?? []) as { id: number; name: string; phone: string | null }[]).map((m) => [m.id, m])
  );
  const trainerMap = new Map(
    ((trainersRes.data ?? []) as { id: number; display_name: string }[]).map((t) => [t.id, t.display_name])
  );
  const passMap = new Map(
    ((passesRes.data ?? []) as { id: number; lesson_kind: string }[]).map((p) => [p.id, p.lesson_kind])
  );

  const lessons = list.map((r) => ({
    id: r.id,
    starts_at: r.starts_at,
    status: r.status,
    member_id: r.member_id,
    member_name: memberMap.get(r.member_id)?.name ?? "—",
    member_phone: memberMap.get(r.member_id)?.phone ?? null,
    trainer_member_id: r.trainer_member_id,
    trainer_name: trainerMap.get(r.trainer_member_id) ?? "—",
    lesson_kind: r.pass_id ? passMap.get(r.pass_id) ?? null : null,
  }));

  const attended = lessons.filter((l) => l.status === "attended").length;
  const noshow = lessons.filter((l) => l.status === "noshow").length;
  const booked = lessons.filter((l) => l.status === "booked").length;

  return NextResponse.json({
    lessons,
    summary: { total: lessons.length, attended, noshow, booked },
    full_view: isFullView,
  });
}
