import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/payout-rules?target_member_id=
 *
 * - target_member_id 미지정 → 센터 기본 룰만
 * - target_member_id 지정 → 그 강사 override 룰만 (없으면 빈 배열)
 *
 * 호출자가 두 번 호출해서 합치는 패턴.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const target = url.searchParams.get("target_member_id");

  let query = supabase
    .from("crm_payout_rules")
    .select(
      "id, target_member_id, mode, tier_index, min_pass_price_won, max_pass_price_won, new_member_value, renewal_value, trial_value"
    )
    .eq("center_id", ctx.centerId)
    .order("tier_index", { ascending: true });

  if (target === null || target === "") {
    query = query.is("target_member_id", null);
  } else {
    query = query.eq("target_member_id", Number(target));
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ rules: data ?? [] });
}

/**
 * POST /api/crm/payout-rules — 룰 추가
 *
 * body: { target_member_id?: number|null, mode, tier_index, min_pass_price_won?, max_pass_price_won?,
 *         new_member_value, renewal_value, trial_value }
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  let body: {
    target_member_id?: number | null;
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

  if (body.mode !== "rate" && body.mode !== "flat") {
    return NextResponse.json({ error: "정산 방식이 잘못됨" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("crm_payout_rules")
    .insert({
      center_id: ctx.centerId,
      target_member_id: body.target_member_id ?? null,
      mode: body.mode,
      tier_index: body.tier_index ?? 0,
      min_pass_price_won: body.min_pass_price_won ?? 0,
      max_pass_price_won: body.max_pass_price_won ?? null,
      new_member_value: body.new_member_value ?? 0,
      renewal_value: body.renewal_value ?? 0,
      trial_value: body.trial_value ?? 0,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "추가 실패", detail: error?.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "payout_rule.create",
    entity_type: "crm_payout_rules",
    entity_id: data.id,
    payload: body as never,
  });

  return NextResponse.json({ ok: true, id: data.id });
}
