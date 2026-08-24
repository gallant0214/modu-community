import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";

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

  // 🔒 기본은 '본인 것'만. all=1(전체/타강사)은 schedule.view_others 권한자만.
  const allView = url.searchParams.get("all") === "1";
  let canViewAll = false;
  if (allView) {
    canViewAll =
      ctx.role === "owner" ||
      (await loadPermissionsForContext(ctx))["schedule.view_others"] === true;
  }
  let personalTrainerId: number | null = null;
  if (!canViewAll) {
    personalTrainerId = ctx.centerMemberId;
  } else if (trainerParam) {
    personalTrainerId = Number(trainerParam);
  }

  // 특정 강사로 필터 시엔 그 강사의 firebase_uid 로 만든 센터 일정도 함께 포함시킨다.
  // (센터 일정은 trainer_member_id=null 이라 personal 조건으로만은 잡히지 않음)
  let filterTrainerUid: string | null = null;
  if (personalTrainerId) {
    const { data: tm } = await supabase
      .from("crm_center_members")
      .select("firebase_uid")
      .eq("id", personalTrainerId)
      .eq("center_id", ctx.centerId)
      .maybeSingle();
    filterTrainerUid = tm?.firebase_uid ?? null;
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
    // 개인 일정: 그 강사가 소유
    // 센터 일정: 그 강사가 만든 것만 (uid 못 찾으면 센터 일정 제외)
    const orParts = [`trainer_member_id.eq.${personalTrainerId}`];
    if (filterTrainerUid) {
      orParts.push(`and(type.eq.center,created_by_uid.eq.${filterTrainerUid})`);
    }
    query = query.or(orParts.join(","));
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  // 프라이버시: 개인 일정(personal)의 상세(제목·내용)는 본인만 볼 수 있다.
  // 본인이 아닌 사람(센터장/관리자 등)에게는 "개인 일정" 블록으로만 표시하고 상세는 서버에서 제거.
  const events = (data ?? []).map((e) => {
    if (e.type === "personal" && e.trainer_member_id !== ctx.centerMemberId) {
      return { ...e, title: "개인 일정", description: null, private: true };
    }
    return e;
  });
  return NextResponse.json({ events });
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

  // 권한 확인 — 타 강사/센터 일정 관리 = schedule.manage_others (직급 권한 일원화)
  const canManageAll =
    ctx.role === "owner" ||
    ctx.role === "admin" ||
    ctx.isSoloOwner ||
    (await loadPermissionsForContext(ctx))["schedule.manage_others"] === true;

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
