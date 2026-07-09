import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/reservations?date=YYYY-MM-DD
 *   또는 ?from=YYYY-MM-DD&to=YYYY-MM-DD (반열린 구간 [from, to])
 *
 * KST 기준. from 만 있고 to 없으면 1일 범위, to 만 있으면 today부터.
 * trainer/manager 는 본인 컬럼만.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const trainerParam = url.searchParams.get("trainer_id");

  let startUtc: Date;
  let endUtc: Date;
  if (from || to) {
    const f = from || new Date().toISOString().slice(0, 10);
    const t = to || f;
    startUtc = new Date(`${f}T00:00:00+09:00`);
    endUtc = new Date(`${t}T00:00:00+09:00`);
    // to 가 inclusive 가 되도록 24시간 추가
    endUtc = new Date(endUtc.getTime() + 24 * 3600 * 1000);
  } else {
    const d = date || new Date().toISOString().slice(0, 10);
    startUtc = new Date(`${d}T00:00:00+09:00`);
    endUtc = new Date(startUtc.getTime() + 24 * 3600 * 1000);
  }

  let query = supabase
    .from("crm_reservations")
    .select(
      "id, pass_id, member_id, trainer_member_id, starts_at, ends_at, status, consumed, attended_at"
    )
    .eq("center_id", ctx.centerId)
    .gte("starts_at", startUtc.toISOString())
    .lt("starts_at", endUtc.toISOString())
    .order("starts_at", { ascending: true });

  // 권한:
  //   trainer         → 본인 스케줄만
  //   manager 이상    → 전체, trainer_id 로 특정 강사만 필터 가능
  if (ctx.role === "trainer") {
    query = query.eq("trainer_member_id", ctx.centerMemberId);
  } else if (trainerParam) {
    query = query.eq("trainer_member_id", Number(trainerParam));
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  // 회원 이름 join
  const memberIds = Array.from(new Set((data ?? []).map((r) => r.member_id)));
  const { data: members } = memberIds.length
    ? await supabase.from("crm_members").select("id, name").in("id", memberIds)
    : { data: [] };
  const nameMap = new Map((members ?? []).map((m) => [m.id, m.name]));

  return NextResponse.json({
    reservations: (data ?? []).map((r) => ({
      ...r,
      member_name: nameMap.get(r.member_id) ?? "",
    })),
  });
}

/**
 * POST /api/crm/reservations
 * 예약 생성.
 *
 * body: { pass_id, starts_at(ISO), ends_at(ISO) }
 *
 * 잔여 0인 수강권엔 못 만듦.
 * trainer 는 can_create_reservation 권한 필요.
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  if (ctx.role === "trainer") {
    const { data: perm } = await supabase
      .from("crm_trainer_permissions")
      .select("can_create_reservation")
      .eq("center_member_id", ctx.centerMemberId)
      .maybeSingle();
    if (!perm?.can_create_reservation) {
      return NextResponse.json({ error: "예약 생성 권한이 없습니다" }, { status: 403 });
    }
  }

  let body: { pass_id?: number; starts_at?: string; ends_at?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const passId = Number(body.pass_id);
  if (!passId || !body.starts_at || !body.ends_at) {
    return NextResponse.json({ error: "필수 항목이 비어있습니다" }, { status: 400 });
  }

  const { data: pass } = await supabase
    .from("crm_passes")
    .select("id, center_id, member_id, trainer_member_id, remaining_sessions, status")
    .eq("id", passId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!pass) return NextResponse.json({ error: "수강권을 찾을 수 없습니다" }, { status: 404 });
  if (pass.status !== "valid") {
    return NextResponse.json({ error: "사용할 수 없는 수강권입니다" }, { status: 400 });
  }
  if (pass.remaining_sessions <= 0) {
    return NextResponse.json({ error: "잔여 세션이 없습니다" }, { status: 400 });
  }

  // trainer 는 본인 담당 수강권만
  if (
    (ctx.role === "trainer" || ctx.role === "manager") &&
    pass.trainer_member_id !== ctx.centerMemberId
  ) {
    return NextResponse.json({ error: "이 수강권의 담당이 아닙니다" }, { status: 403 });
  }

  const { data: created, error } = await supabase
    .from("crm_reservations")
    .insert({
      center_id: ctx.centerId,
      pass_id: passId,
      member_id: pass.member_id,
      trainer_member_id: pass.trainer_member_id,
      starts_at: body.starts_at,
      ends_at: body.ends_at,
      status: "booked",
      consumed: false,
      created_by_uid: ctx.uid,
    })
    .select("id")
    .single();

  if (error || !created) {
    return NextResponse.json({ error: "예약 생성 실패", detail: error?.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, reservationId: created.id });
}
