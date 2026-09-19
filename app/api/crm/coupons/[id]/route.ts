import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { validateCouponInput } from "@/app/lib/crm-coupons-db";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/crm/coupons/[id]
 *   { action: "archive" | "restore" }      보관/복원
 *   { ...쿠폰 필드 }                         수정
 *
 * 🚨 이미 발급된 쿠폰이 있으면 **이름·설명만** 바꿀 수 있다.
 *    혜택·조건은 사용 시점에 쿠폰 정의로 계산되므로, 바꾸면 이미 받은 회원 쿠폰의 가치가 달라진다.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "coupons.manage"))) {
    return NextResponse.json({ error: "쿠폰 관리 권한이 없습니다" }, { status: 403 });
  }
  const id = Number((await params).id);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { data: cur } = await supabase
    .from("crm_coupons")
    .select("id, name")
    .eq("id", id)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!cur) return NextResponse.json({ error: "쿠폰을 찾을 수 없어요" }, { status: 404 });

  let patch: Record<string, unknown>;
  let action = "coupon.update";
  if (body.action === "archive" || body.action === "restore") {
    patch = { status: body.action === "archive" ? "archived" : "active" };
    action = body.action === "archive" ? "coupon.archive" : "coupon.restore";
  } else {
    const { count } = await supabase
      .from("crm_coupon_issues")
      .select("id", { count: "exact", head: true })
      .eq("coupon_id", id);
    if ((count ?? 0) > 0) {
      const name = String(body.name ?? "").trim();
      if (!name) return NextResponse.json({ error: "쿠폰 이름을 입력해 주세요" }, { status: 400 });
      patch = {
        name: name.slice(0, 40),
        description: String(body.description ?? "").trim().slice(0, 300) || null,
      };
    } else {
      const v = validateCouponInput(body);
      if (v.error) return NextResponse.json({ error: v.error }, { status: 400 });
      patch = v.row ?? {};
    }
  }

  const { error } = await supabase
    .from("crm_coupons")
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) return NextResponse.json({ error: "저장 실패", detail: error.message }, { status: 500 });

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action,
    entity_type: "coupon",
    entity_id: id,
    payload: { name: (cur as { name: string }).name, ...patch } as never,
  });
  return NextResponse.json({ ok: true });
}
