import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/products/[id] — 단일 상품 조회
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const pid = Number(id);
  if (!pid) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { data, error } = await supabase
    .from("crm_products")
    .select("*")
    .eq("id", pid)
    .eq("center_id", ctx.centerId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "상품을 찾을 수 없습니다" }, { status: 404 });
  return NextResponse.json({ product: data });
}

/**
 * PATCH /api/crm/products/[id] — 상품 수정
 * body: 필드만 있으면 부분 업데이트. type/billing_mode 등 CHECK 위반은 서버에서 거부.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const pid = Number(id);
  if (!pid) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const allowed = [
    "type",
    "billing_mode",
    "category",
    "name",
    "description",
    "open_time",
    "close_time",
    "operating_days",
    "duration_value",
    "duration_unit",
    "service_days",
    "total_sessions",
    "pause_enabled",
    "pause_days",
    "price_won",
    "vat_included",
    "capacity",
    "session_minutes",
    "status",
  ] as const;

  const patch: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) patch[k] = body[k];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 항목이 없습니다" }, { status: 400 });
  }
  if (typeof patch.name === "string") {
    const trimmed = (patch.name as string).trim();
    if (!trimmed) return NextResponse.json({ error: "상품명을 입력해 주세요" }, { status: 400 });
    patch.name = trimmed;
  }

  const { error } = await supabase
    .from("crm_products")
    .update(patch as never)
    .eq("id", pid)
    .eq("center_id", ctx.centerId);

  if (error) {
    return NextResponse.json({ error: "수정 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const pid = Number(id);
  if (!pid) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { error } = await supabase
    .from("crm_products")
    .update({ status: "inactive" } as never)
    .eq("id", pid)
    .eq("center_id", ctx.centerId);

  if (error) {
    return NextResponse.json({ error: "삭제 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
