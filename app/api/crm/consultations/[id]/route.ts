import { errDetail } from "@/app/lib/api-error";
import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission, requirePermission, permissionDeniedResponse } from "@/app/lib/crm-permissions";
import { buildConsultationPayload } from "@/app/lib/crm-consultation";

export const dynamic = "force-dynamic";

const STATUSES = ["draft", "open", "converted", "lost"] as const;

/** 상담 상세 조회 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const cid = Number(id);
  if (!cid) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { data, error } = await supabase
    .from("crm_pt_consultations")
    .select("*")
    .eq("id", cid)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: errDetail(error) }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "상담을 찾을 수 없습니다" }, { status: 404 });

  // 본인 담당·본인 작성은 언제나 열람. 그 외는 'PT 상담지 전체 보기' 권한 필요.
  const isMine = data.trainer_member_id === ctx.centerMemberId || data.created_by_uid === ctx.uid;
  if (!isMine && !(await ctxHasPermission(ctx, "consultations.view_all"))) {
    return permissionDeniedResponse("consultations.view_all");
  }

  // trainer_name join (등록 강사 우선, 없으면 직접 입력값)
  let trainer_name: string | null = null;
  if (data.trainer_member_id) {
    const { data: t } = await supabase
      .from("crm_center_members")
      .select("display_name")
      .eq("id", data.trainer_member_id)
      .maybeSingle();
    trainer_name = t?.display_name ?? null;
  } else if (data.trainer_name_custom) {
    trainer_name = `${data.trainer_name_custom} (직접 입력)`;
  }

  // 템플릿 definition join (있으면 상세페이지 커스텀 렌더링에 사용)
  let template: { id: number; name: string; definition: unknown } | null = null;
  if (data.template_id) {
    const { data: t } = await supabase
      .from("crm_consultation_templates")
      .select("id, name, definition")
      .eq("id", data.template_id)
      .maybeSingle();
    template = t ?? null;
  }

  return NextResponse.json({ consultation: { ...data, trainer_name, template } });
}

/**
 * PATCH — 상담 내용 수정, 상태 변경(converted/lost/open) 포함.
 * body.status='converted' 시 converted_pass_id/converted_at 자동/수동 설정.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const cid = Number(id);
  if (!cid) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { data: cur } = await supabase
    .from("crm_pt_consultations")
    .select("center_id, trainer_member_id, created_by_uid")
    .eq("id", cid)
    .maybeSingle();
  if (!cur || cur.center_id !== ctx.centerId) {
    return NextResponse.json({ error: "상담을 찾을 수 없습니다" }, { status: 404 });
  }
  // 수정 = 'PT 상담지 작성·수정' 권한 + (본인 담당·본인 작성 또는 '전체 보기' 권한)
  const writeDenied = await requirePermission(ctx, "consultations.write");
  if (writeDenied) return writeDenied;
  const isMine = cur.trainer_member_id === ctx.centerMemberId || cur.created_by_uid === ctx.uid;
  if (!isMine && !(await ctxHasPermission(ctx, "consultations.view_all"))) {
    return permissionDeniedResponse("consultations.view_all");
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const statusOnlyKeys = new Set([
    "status",
    "converted_pass_id",
    "converted_at",
    "lost_reason",
  ]);
  const hasConsultationContent = Object.keys(body).some((key) => !statusOnlyKeys.has(key));
  const patch: Record<string, unknown> = {
    ...(hasConsultationContent ? buildConsultationPayload(body, ctx.centerMemberId) : {}),
    updated_at: new Date().toISOString(),
  };

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name) patch.name = name;
  // 유효한 YYYY-MM-DD 만 반영(빈값/형식오류는 건드리지 않음 → DATE 오류 방지)
  if (typeof body.consulted_at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.consulted_at.trim())) {
    patch.consulted_at = body.consulted_at.trim();
  }

  // 상태 변경
  if (typeof body.status === "string") {
    if (!(STATUSES as readonly string[]).includes(body.status)) {
      return NextResponse.json({ error: "상태 값이 잘못됨" }, { status: 400 });
    }
    patch.status = body.status;
    if (body.status === "converted") {
      patch.converted_pass_id = Number(body.converted_pass_id) || null;
      patch.converted_at =
        (typeof body.converted_at === "string" && body.converted_at) ||
        new Date().toISOString();
      patch.lost_reason = null;
    } else if (body.status === "lost") {
      patch.lost_reason = typeof body.lost_reason === "string" ? body.lost_reason.trim() : null;
      patch.converted_pass_id = null;
      patch.converted_at = null;
    } else {
      patch.converted_pass_id = null;
      patch.converted_at = null;
      patch.lost_reason = null;
    }
  }

  const { error } = await supabase
    .from("crm_pt_consultations")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq("id", cid)
    .eq("center_id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "저장 실패", detail: errDetail(error) }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "pt_consultation.update",
    entity_type: "crm_pt_consultations",
    entity_id: cid,
    payload: { status: patch.status ?? null } as never,
  });

  return NextResponse.json({ ok: true });
}

/** 상담 삭제 — 직급권한 'PT 상담지 삭제' */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  const permDenied = await requirePermission(ctx, "consultations.delete");
  if (permDenied) return permDenied;

  const { id } = await params;
  const cid = Number(id);
  if (!cid) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { error } = await supabase
    .from("crm_pt_consultations")
    .delete()
    .eq("id", cid)
    .eq("center_id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "삭제 실패", detail: errDetail(error) }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "pt_consultation.delete",
    entity_type: "crm_pt_consultations",
    entity_id: cid,
    payload: {} as never,
  });

  return NextResponse.json({ ok: true });
}
