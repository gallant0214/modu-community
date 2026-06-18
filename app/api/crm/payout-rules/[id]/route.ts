import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const rid = Number(id);
  if (!rid) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  let body: {
    mode?: string;
    tier_index?: number;
    min_pass_price_won?: number;
    max_pass_price_won?: number | null;
    new_member_value?: number;
    renewal_value?: number;
    trial_value?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.mode !== undefined) {
    if (body.mode !== "rate" && body.mode !== "flat")
      return NextResponse.json({ error: "정산 방식이 잘못됨" }, { status: 400 });
    patch.mode = body.mode;
  }
  if (body.tier_index !== undefined) patch.tier_index = body.tier_index;
  if (body.min_pass_price_won !== undefined) patch.min_pass_price_won = body.min_pass_price_won;
  if (body.max_pass_price_won !== undefined) patch.max_pass_price_won = body.max_pass_price_won;
  if (body.new_member_value !== undefined) patch.new_member_value = body.new_member_value;
  if (body.renewal_value !== undefined) patch.renewal_value = body.renewal_value;
  if (body.trial_value !== undefined) patch.trial_value = body.trial_value;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 항목이 없습니다" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_payout_rules")
    .update(patch as never)
    .eq("id", rid)
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
  const rid = Number(id);
  if (!rid) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { error } = await supabase
    .from("crm_payout_rules")
    .delete()
    .eq("id", rid)
    .eq("center_id", ctx.centerId);

  if (error) {
    return NextResponse.json({ error: "삭제 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
