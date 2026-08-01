import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { buildConsultationPayload } from "@/app/lib/crm-consultation";

export const dynamic = "force-dynamic";

const LIST_COLUMNS =
  "id, member_id, name, gender, birth, phone, address_dong, trainer_member_id, trainer_name_custom, goals, status, converted_at, converted_pass_id, lost_reason, consulted_at, created_at";

/**
 * GET /api/crm/consultations?status=&trainer_id=&q=&from=&to=&limit=
 * PT 상담 목록. trainer/manager 는 본인이 담당한 상담만.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const trainerParam = url.searchParams.get("trainer_id");
  const q = (url.searchParams.get("q") || "").trim();
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

  // trainer/manager 는 본인 담당 상담만. (owner/admin/solo owner 는 전체)
  const isRestricted = (ctx.role === "trainer" || ctx.role === "manager") && !ctx.isSoloOwner;
  if (isRestricted) {
    query = query.eq("trainer_member_id", ctx.centerMemberId);
  } else if (trainerParam) {
    query = query.eq("trainer_member_id", Number(trainerParam));
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "상담자 이름을 입력해 주세요" }, { status: 400 });

  const payload = buildConsultationPayload(body, ctx.centerMemberId);
  const insert = {
    center_id: ctx.centerId,
    created_by_uid: ctx.uid,
    consulted_at: (body.consulted_at as string) || undefined,
    ...payload,
    name,
  };

  const { data: created, error } = await supabase
    .from("crm_pt_consultations")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(insert as any)
    .select("id")
    .single();

  if (error || !created) {
    return NextResponse.json({ error: "저장 실패", detail: error?.message }, { status: 500 });
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
