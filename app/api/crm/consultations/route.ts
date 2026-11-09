import { errDetail } from "@/app/lib/api-error";
import { NextResponse } from "next/server";
import { escapePostgrestQuery } from "@/app/lib/security";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission, requirePermission } from "@/app/lib/crm-permissions";
import { buildConsultationPayload } from "@/app/lib/crm-consultation";

export const dynamic = "force-dynamic";

const LIST_COLUMNS =
  "id, member_id, name, gender, birth, phone, address_dong, trainer_member_id, trainer_name_custom, goals, safety_screening, follow_up_details, status, converted_at, converted_pass_id, lost_reason, consulted_at, created_at";

/**
 * GET /api/crm/consultations?status=&trainer_id=&q=&from=&to=&limit=
 * PT 상담 목록. 직급권한 'PT 상담지 전체 보기'(consultations.view_all) 가 없으면
 * 본인이 담당이거나 **본인이 작성한** 상담만.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const trainerParam = url.searchParams.get("trainer_id");
  // 🚨 .or() 필터 문자열에 그대로 들어간다 — 쉼표·괄호를 지우지 않으면 조건을 끼워 넣을 수 있다
  const q = escapePostgrestQuery(url.searchParams.get("q") || "");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 200), 1), 1000);

  let query = supabase
    .from("crm_pt_consultations")
    .select(LIST_COLUMNS)
    .eq("center_id", ctx.centerId)
    .order("consulted_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);
  if (from) query = query.gte("consulted_at", from);
  if (to) query = query.lte("consulted_at", to);
  if (q) {
    const like = `%${q}%`;
    query = query.or(`name.ilike.${like},phone.ilike.${like}`);
  }

  // 전체 보기 권한이 없으면 본인 담당 + 본인 작성 상담만.
  //  🚨 예전엔 '담당'만 봐서, 아르바이트가 다른 강사를 담당으로 적고 저장하면 자기 상담지를 못 봤다.
  const canViewAll = await ctxHasPermission(ctx, "consultations.view_all");
  if (!canViewAll) {
    query = query.or(`trainer_member_id.eq.${ctx.centerMemberId},created_by_uid.eq.${ctx.uid}`);
    if (trainerParam) query = query.eq("trainer_member_id", Number(trainerParam));
  } else if (trainerParam) {
    query = query.eq("trainer_member_id", Number(trainerParam));
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: errDetail(error) }, { status: 500 });
  }

  const trainerIds = Array.from(
    new Set((data ?? []).map((r) => r.trainer_member_id).filter((v): v is number => !!v))
  );
  const staffMap = new Map<number, string>();
  if (trainerIds.length) {
    const { data: staff } = await supabase
      .from("crm_center_members")
      .select("id, display_name")
      .in("id", trainerIds);
    for (const s of staff ?? []) staffMap.set(s.id, s.display_name);
  }

  const consultations = (data ?? []).map((r) => ({
    ...r,
    trainer_name: r.trainer_member_id
      ? staffMap.get(r.trainer_member_id) ?? null
      : r.trainer_name_custom
        ? `${r.trainer_name_custom} (직접 입력)`
        : null,
  }));

  return NextResponse.json({ consultations });
}

/**
 * POST /api/crm/consultations
 * 새 PT 상담지 저장. name 만 필수.
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  const permDenied = await requirePermission(ctx, "consultations.write");
  if (permDenied) return permDenied;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const isDraft = body.status === "draft";
  const name = String(body.name ?? "").trim();
  // 임시저장(draft)은 이름 미입력도 허용 — 기본 이름으로 저장해 리스트에서 이어쓰기 가능.
  if (!name && !isDraft) {
    return NextResponse.json({ error: "상담자 이름을 입력해 주세요" }, { status: 400 });
  }

  const payload = buildConsultationPayload(body, ctx.centerMemberId);
  // consulted_at 은 유효한 YYYY-MM-DD 만 저장(형식오류/빈값은 DB 기본값 사용 → DATE 오류 방지)
  const consultedAtValid =
    typeof body.consulted_at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.consulted_at.trim())
      ? body.consulted_at.trim()
      : undefined;
  const insert = {
    center_id: ctx.centerId,
    created_by_uid: ctx.uid,
    consulted_at: consultedAtValid,
    ...payload,
    name: name || "무제 상담",
    ...(isDraft ? { status: "draft" } : {}),
  };

  const { data: created, error } = await supabase
    .from("crm_pt_consultations")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(insert as any)
    .select("id")
    .single();

  if (error || !created) {
    return NextResponse.json({ error: "저장 실패", detail: errDetail(error) }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "pt_consultation.create",
    entity_type: "crm_pt_consultations",
    entity_id: created.id,
    payload: { name } as never,
  });

  return NextResponse.json({ ok: true, id: created.id });
}
