import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

const DEFAULT_SEED = {
  name: "스페셜바디 PT 상담지",
  description: "스페셜바디 원본 상담지 항목 기반. 별도 지정이 없을 때 사용됩니다.",
  is_default: true,
  sort_order: 0,
};

/**
 * GET /api/crm/consultations/templates
 * 활성 템플릿 목록. 첫 접근이면 기본 템플릿 1건을 자동 시드.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { data, error } = await supabase
    .from("crm_consultation_templates")
    .select("id, name, description, is_default, sort_order, active, created_at, updated_at")
    .eq("center_id", ctx.centerId)
    .eq("active", true)
    .order("is_default", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  if ((data ?? []).length === 0) {
    // 자동 시드
    const { data: seeded, error: seedErr } = await supabase
      .from("crm_consultation_templates")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({ ...DEFAULT_SEED, center_id: ctx.centerId } as any)
      .select("id, name, description, is_default, sort_order, active, created_at, updated_at")
      .single();
    if (seedErr || !seeded) {
      return NextResponse.json({ templates: [] });
    }
    return NextResponse.json({ templates: [seeded] });
  }

  return NextResponse.json({ templates: data });
}

/**
 * POST — 새 상담지 템플릿 추가. owner/admin(또는 solo owner) 만.
 * body: { name, description? }
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  let body: { name?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "상담지 이름을 입력해 주세요" }, { status: 400 });

  const description = (body.description ?? "").trim() || null;

  const { data: created, error } = await supabase
    .from("crm_consultation_templates")
    .insert({
      center_id: ctx.centerId,
      name,
      description,
      is_default: false,
      // 마지막 순서로
      sort_order: 999,
      active: true,
    })
    .select("id, name, description, is_default, sort_order, active")
    .single();
  if (error || !created) {
    return NextResponse.json({ error: "저장 실패", detail: error?.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "consultation_template.create",
    entity_type: "crm_consultation_templates",
    entity_id: created.id,
    payload: { name } as never,
  });

  return NextResponse.json({ ok: true, template: created });
}
