import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/passes/[id]
 * 수강권 상세 + 회원 이름 + 수업 내역(crm_reservations).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const passId = Number(id);
  if (!passId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { data: pass, error } = await supabase
    .from("crm_passes")
    .select(
      "id, member_id, trainer_member_id, co_trainer_ids, seller_member_id, issue_type, lesson_kind, total_sessions, remaining_sessions, service_sessions, session_minutes, price_won, vat_included, payment_method, payment_method_custom, issued_at, start_date, expires_at, status, memo, attendance_mileage_earn, created_at"
    )
    .eq("id", passId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  if (!pass) {
    return NextResponse.json({ error: "수강권을 찾을 수 없습니다" }, { status: 404 });
  }

  // trainer/manager 는 본인 담당(주강사/추가강사) 또는 본인 판매만. solo owner 는 예외.
  const passCoIds = ((pass as { co_trainer_ids?: number[] }).co_trainer_ids ?? []) as number[];
  if (
    (ctx.role === "trainer" || ctx.role === "manager") &&
    !ctx.isSoloOwner &&
    pass.trainer_member_id !== ctx.centerMemberId &&
    pass.seller_member_id !== ctx.centerMemberId &&
    !passCoIds.includes(ctx.centerMemberId as number)
  ) {
    return NextResponse.json({ error: "접근 권한이 없습니다" }, { status: 403 });
  }

  const coIds = ((pass as { co_trainer_ids?: number[] }).co_trainer_ids ?? []).filter(
    (v): v is number => !!v
  );
  // 담당강사·판매자·추가강사 이름 한 번에 조회
  const staffIds = Array.from(
    new Set(
      [pass.trainer_member_id, pass.seller_member_id, ...coIds].filter(
        (v): v is number => !!v
      )
    )
  );
  const [{ data: member }, { data: reservations }, { data: staffRows }] = await Promise.all([
    supabase.from("crm_members").select("id, name, phone, face_image_thumb").eq("id", pass.member_id).maybeSingle(),
    supabase
      .from("crm_reservations")
      .select("id, starts_at, ends_at, status, consumed, cancelled_reason, cancelled_at")
      .eq("pass_id", passId)
      .order("starts_at", { ascending: false })
      .limit(100),
    staffIds.length
      ? supabase.from("crm_center_members").select("id, display_name").in("id", staffIds)
      : Promise.resolve({ data: [] as { id: number; display_name: string }[] }),
  ]);

  const nameOf = (mid: number | null | undefined) =>
    mid ? (staffRows ?? []).find((r) => r.id === mid)?.display_name ?? null : null;
  const co_trainers = coIds
    .map((id) => {
      const name = nameOf(id);
      return name ? { id, name } : null;
    })
    .filter((v): v is { id: number; name: string } => !!v);

  return NextResponse.json({
    pass,
    member,
    reservations: reservations ?? [],
    co_trainers,
    trainer_name: nameOf(pass.trainer_member_id),
    seller_name: nameOf(pass.seller_member_id),
  });
}

/**
 * PATCH /api/crm/passes/[id]
 * 수강권 정보 수정 — 담당강사·수업 종류·회당 시간·메모·만료일·결제 등.
 * 권한: passes.edit (default owner/admin. 설정 > 권한에서 manager/trainer 에게 부여 가능)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const perms = await loadPermissionsForContext(ctx);
  if (!perms["passes.edit"]) {
    return NextResponse.json({ error: "수강권 수정 권한이 없습니다" }, { status: 403 });
  }

  const { id } = await params;
  const passId = Number(id);
  if (!passId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  let body: {
    memo?: string;
    expires_at?: string;
    issued_at?: string;
    start_date?: string;
    price_won?: number;
    vat_included?: boolean;
    payment_method?: string;
    payment_method_custom?: string;
    trainer_member_id?: number;
    co_trainer_ids?: number[];
    seller_member_id?: number;
    session_minutes?: number;
    lesson_kind?: string;
    total_sessions?: number;
    remaining_sessions?: number;
    service_sessions?: number;
    attendance_mileage_earn?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.memo !== undefined) patch.memo = body.memo?.trim() || null;
  if (body.expires_at) patch.expires_at = body.expires_at;
  if (body.issued_at) patch.issued_at = body.issued_at;
  if (body.start_date) patch.start_date = body.start_date;
  if (body.price_won !== undefined && body.price_won >= 0) patch.price_won = body.price_won;
  if (body.vat_included !== undefined) patch.vat_included = !!body.vat_included;
  if (body.payment_method) {
    patch.payment_method = body.payment_method;
    if (body.payment_method === "etc") {
      patch.payment_method_custom = body.payment_method_custom?.trim() || null;
    } else {
      patch.payment_method_custom = null;
    }
  }
  if (body.trainer_member_id && Number.isFinite(body.trainer_member_id)) {
    patch.trainer_member_id = Number(body.trainer_member_id);
  }
  if (body.co_trainer_ids !== undefined) {
    const primary = Number(patch.trainer_member_id ?? body.trainer_member_id ?? 0);
    const requested = Array.from(
      new Set(
        (Array.isArray(body.co_trainer_ids) ? body.co_trainer_ids : [])
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n > 0 && n !== primary)
      )
    );
    if (requested.length) {
      // 본인 센터 소속 직원인지 검증
      const { data: valid } = await supabase
        .from("crm_center_members")
        .select("id")
        .eq("center_id", ctx.centerId)
        .in("id", requested);
      patch.co_trainer_ids = (valid ?? []).map((v) => v.id);
    } else {
      patch.co_trainer_ids = [];
    }
  }
  if (body.seller_member_id && Number.isFinite(body.seller_member_id)) {
    patch.seller_member_id = Number(body.seller_member_id);
  }
  if (body.session_minutes !== undefined && body.session_minutes >= 0) {
    patch.session_minutes = Number(body.session_minutes);
  }
  if (body.lesson_kind !== undefined && typeof body.lesson_kind === "string") {
    const v = body.lesson_kind.trim();
    if (v) patch.lesson_kind = v;
  }
  if (body.total_sessions !== undefined && body.total_sessions >= 0) {
    patch.total_sessions = Number(body.total_sessions);
  }
  if (body.remaining_sessions !== undefined && body.remaining_sessions >= 0) {
    patch.remaining_sessions = Number(body.remaining_sessions);
  }
  // 서비스 섹션(무료 보너스) — 수업료 계산에는 포함되지 않음
  if (body.service_sessions !== undefined && body.service_sessions >= 0) {
    patch.service_sessions = Math.max(0, Math.floor(Number(body.service_sessions) || 0));
  }
  if (body.attendance_mileage_earn !== undefined) {
    patch.attendance_mileage_earn = Math.max(
      0,
      Math.floor(Number(body.attendance_mileage_earn) || 0)
    );
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 항목이 없습니다" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_passes")
    .update(patch as never)
    .eq("id", passId)
    .eq("center_id", ctx.centerId);

  if (error) {
    return NextResponse.json({ error: "수정 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "pass.update",
    entity_type: "crm_passes",
    entity_id: passId,
    payload: patch as never,
  });

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/crm/passes/[id]
 * 수강권 환불 (status='refunded') — soft 처리.
 * 환불 시 잔여 예약 자동 취소는 별도 로직 필요 (1차 v1 에선 수동).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const perms = await loadPermissionsForContext(ctx);
  if (!perms["passes.refund"]) {
    return NextResponse.json({ error: "수강권 환불 권한이 없습니다" }, { status: 403 });
  }

  const { id } = await params;
  const passId = Number(id);
  if (!passId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { error } = await supabase
    .from("crm_passes")
    .update({ status: "refunded" } as never)
    .eq("id", passId)
    .eq("center_id", ctx.centerId);

  if (error) {
    return NextResponse.json({ error: "환불 처리 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "pass.refund",
    entity_type: "pass",
    entity_id: passId,
    payload: null,
  });

  return NextResponse.json({ ok: true });
}
