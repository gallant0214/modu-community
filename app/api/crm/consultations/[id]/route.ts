import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { buildConsultationPayload } from "@/app/lib/crm-consultation";

export const dynamic = "force-dynamic";

const STATUSES = ["open", "converted", "lost"] as const;

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
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "상담을 찾을 수 없습니다" }, { status: 404 });

  const isRestricted = (ctx.role === "trainer" || ctx.role === "manager") && !ctx.isSoloOwner;
  if (isRestricted && data.trainer_member_id !== ctx.centerMemberId) {
    return NextResponse.json({ error: "접근 권한이 없습니다" }, { status: 403 });
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
    .select("center_id, trainer_member_id")
    .eq("id", cid)
    .maybeSingle();
  if (!cur || cur.center_id !== ctx.centerId) {
    return NextResponse.json({ error: "상담을 찾을 수 없습니다" }, { status: 404 });
  }
  const isRestricted = (ctx.role === "trainer" || ctx.role === "manager") && !ctx.isSoloOwner;
  if (isRestricted && cur.trainer_member_id !== ctx.centerMemberId) {
    return NextResponse.json({ error: "접근 권한이 없습니다" }, { status: 403 });
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
  if (typeof body.consulted_at === "string") patch.consulted_at = body.consulted_at;

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
    return NextResponse.json({ error: "저장 실패", detail: error.message }, { status: 500 });
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

/** 상담 삭제 (owner/admin/solo owner 만) */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const cid = Number(id);
  if (!cid) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { error } = await supabase
    .from("crm_pt_consultations")
    .delete()
    .eq("id", cid)
    .eq("center_id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "삭제 실패", detail: error.message }, { status: 500 });
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
