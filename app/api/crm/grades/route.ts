import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

const BASE_ROLES = ["owner", "admin", "manager", "trainer", "fc", "alba"] as const;

/**
 * GET /api/crm/grades
 * 본인 센터의 등급 목록 (시스템 + 커스텀).
 * 모든 직원이 조회 가능 (직원 추가/상세 드롭다운 채움용).
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { data, error } = await supabase
    .from("crm_grades")
    .select("id, base_role, label, is_system, sort_order")
    .eq("center_id", ctx.centerId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ grades: data ?? [] });
}

/**
 * POST /api/crm/grades — 커스텀 등급 추가. owner/admin 만.
 * body: { base_role, label, sort_order? }
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  let body: { base_role?: string; label?: string; sort_order?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const baseRole = body.base_role;
  if (!baseRole || !BASE_ROLES.includes(baseRole as (typeof BASE_ROLES)[number])) {
    return NextResponse.json({ error: "기본 등급 값이 잘못됨" }, { status: 400 });
  }
  const label = body.label?.trim();
  if (!label) return NextResponse.json({ error: "등급 이름을 입력해주세요" }, { status: 400 });

  const { data, error } = await supabase
    .from("crm_grades")
    .insert({
      center_id: ctx.centerId,
      base_role: baseRole,
      label,
      is_system: false,
      sort_order: typeof body.sort_order === "number" ? body.sort_order : 100,
    })
    .select("id")
    .single();

  if (error || !data) {
    // 중복 라벨
    if (error?.code === "23505") {
      return NextResponse.json({ error: "같은 이름의 등급이 이미 있습니다" }, { status: 409 });
    }
    return NextResponse.json({ error: "추가 실패", detail: error?.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "grade.create",
    entity_type: "crm_grades",
    entity_id: data.id,
    payload: { base_role: baseRole, label } as never,
  });

  return NextResponse.json({ ok: true, gradeId: data.id });
}
