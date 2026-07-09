import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/schedule-events?from=YYYY-MM-DD&to=YYYY-MM-DD&trainer_id=
 * KST 기준. type=center 이벤트는 항상 반환, personal 은 강사 조건 매칭.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const from = url.searchParams.get("from") || new Date().toISOString().slice(0, 10);
  const to = url.searchParams.get("to") || from;
  const trainerParam = url.searchParams.get("trainer_id");

  const startUtc = new Date(`${from}T00:00:00+09:00`);
  const endUtc = new Date(`${to}T00:00:00+09:00`);
  endUtc.setUTCHours(endUtc.getUTCHours() + 24);

  // 개인 일정 필터 (권한별)
  let personalTrainerId: number | null = null;
  if (ctx.role === "trainer") {
    personalTrainerId = ctx.centerMemberId;
  } else if (trainerParam) {
    personalTrainerId = Number(trainerParam);
  }

  let query = supabase
    .from("crm_schedule_events")
    .select(
      "id, type, title, description, trainer_member_id, starts_at, ends_at, status, created_by_uid, created_at"
    )
    .eq("center_id", ctx.centerId)
    .eq("status", "active")
    .gte("starts_at", startUtc.toISOString())
    .lt("starts_at", endUtc.toISOString())
    .order("starts_at", { ascending: true });

  if (personalTrainerId) {
    query = query.or(`type.eq.center,trainer_member_id.eq.${personalTrainerId}`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ events: data ?? [] });
}

/**
 * POST /api/crm/schedule-events
 * body: { type, title, description?, trainer_member_id?, starts_at, ends_at }
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  let body: {
    type?: string;
    title?: string;
    description?: string;
    trainer_member_id?: number;
    starts_at?: string;
    ends_at?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const type = body.type;
  if (type !== "center" && type !== "personal") {
    return NextResponse.json({ error: "일정 유형이 잘못됨" }, { status: 400 });
  }
  const title = body.title?.trim();
  if (!title) return NextResponse.json({ error: "제목을 입력해 주세요" }, { status: 400 });
  if (!body.starts_at || !body.ends_at) {
    return NextResponse.json({ error: "시작·종료 시각이 필요해요" }, { status: 400 });
  }

  // 권한 확인
  let canManageAll = ctx.role === "owner" || ctx.role === "admin";
  if (!canManageAll) {
    const { data: perm } = await supabase
      .from("crm_trainer_permissions")
      .select("can_manage_all_schedules")
      .eq("center_member_id", ctx.centerMemberId)
      .maybeSingle();
    if (perm?.can_manage_all_schedules) canManageAll = true;
  }

  // 센터 일정: 관리자 또는 can_manage_all_schedules 있는 경우만
  if (type === "center" && !canManageAll) {
    return NextResponse.json({ error: "센터 일정은 관리자만 등록할 수 있어요" }, { status: 403 });
  }

  let trainerMemberId: number | null = null;
  if (type === "personal") {
    trainerMemberId = Number(body.trainer_member_id) || ctx.centerMemberId;
    // 본인 일정만 등록 가능 (단 can_manage_all_schedules 는 예외)
    if (!canManageAll && trainerMemberId !== ctx.centerMemberId) {
      return NextResponse.json({ error: "본인 일정만 등록할 수 있어요" }, { status: 403 });
    }
  }

  const { data: created, error } = await supabase
    .from("crm_schedule_events")
    .insert({
      center_id: ctx.centerId,
      type,
      title,
      description: body.description?.trim() || null,
      trainer_member_id: trainerMemberId,
      starts_at: body.starts_at,
      ends_at: body.ends_at,
      status: "active",
      created_by_uid: ctx.uid,
    })
    .select("id")
    .single();

  if (error || !created) {
    return NextResponse.json({ error: "저장 실패", detail: error?.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "schedule_event.create",
    entity_type: "crm_schedule_events",
    entity_id: created.id,
    payload: { type, title } as never,
  });

  return NextResponse.json({ ok: true, id: created.id });
}
