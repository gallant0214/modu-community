import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/crm/product-types/[id] — 커스텀 유형 이름(label) 변경.
 * body: { label: string }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const typeId = Number(id);
  if (!typeId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  let body: { label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const label = body.label?.trim();
  if (!label) return NextResponse.json({ error: "이름을 입력해 주세요" }, { status: 400 });
  if (label.length > 20) return NextResponse.json({ error: "20자 이내로 입력해 주세요" }, { status: 400 });

  const { error } = await supabase
    .from("crm_product_types")
    .update({ label } as never)
    .eq("id", typeId)
    .eq("center_id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "수정 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/crm/product-types/[id] — 커스텀 유형 삭제(soft, status=inactive).
 * 이 유형을 사용 중인 상품이 있으면 안내와 함께 거부.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const typeId = Number(id);
  if (!typeId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { data: t } = await supabase
    .from("crm_product_types")
    .select("id, key")
    .eq("id", typeId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!t) return NextResponse.json({ error: "유형을 찾을 수 없어요" }, { status: 404 });

  const { count } = await supabase
    .from("crm_products")
    .select("id", { count: "exact", head: true })
    .eq("center_id", ctx.centerId)
    .eq("type", t.key)
    .eq("status", "active");
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `이 유형을 사용 중인 상품이 ${count}개 있어요. 먼저 상품을 정리해 주세요.` },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("crm_product_types")
    .update({ status: "inactive" } as never)
    .eq("id", typeId);
  if (error) {
    return NextResponse.json({ error: "삭제 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
