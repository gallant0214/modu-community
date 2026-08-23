import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/lockers/of-member?member_id=123
 * 회원에게 배정된 락커 + 그 회원의 락커 결제(crm_sales product_type='락커') 요약.
 * 회원 상세 '현재 보유' 락커 상세 모달용.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const memberId = Number(url.searchParams.get("member_id"));
  if (!memberId) return NextResponse.json({ error: "member_id 필요" }, { status: 400 });

  const { data: lockersRaw, error } = await supabase
    .from("crm_lockers")
    .select("id, zone_id, number, start_date, expires_at, password, memo")
    .eq("center_id", ctx.centerId)
    .eq("assigned_member_id", memberId)
    .eq("state", "assigned");
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  const zoneIds = Array.from(new Set((lockersRaw ?? []).map((l) => l.zone_id)));
  const { data: zones } = zoneIds.length
    ? await supabase.from("crm_locker_zones").select("id, name").in("id", zoneIds)
    : { data: [] };
  const zoneMap = new Map((zones ?? []).map((z) => [z.id, z.name]));

  const canSeePw = await ctxHasPermission(ctx, "lockers.edit");
  const lockers = (lockersRaw ?? []).map((l) => ({
    id: l.id,
    zone_id: l.zone_id,
    zone_name: zoneMap.get(l.zone_id) ?? "",
    number: l.number,
    start_date: l.start_date,
    expires_at: l.expires_at,
    password: canSeePw ? l.password : null,
    memo: l.memo,
  }));

  // 락커 결제 요약 (판매만, 환불은 음수라 합산에 반영)
  const { data: sales } = await supabase
    .from("crm_sales")
    .select("amount_won, tx_at")
    .eq("center_id", ctx.centerId)
    .eq("member_id", memberId)
    .eq("product_type", "락커")
    .order("tx_at", { ascending: false });
  const totalWon = (sales ?? []).reduce((s, r) => s + (Number(r.amount_won) || 0), 0);
  const lastAt = (sales ?? []).find((r) => (Number(r.amount_won) || 0) !== 0)?.tx_at ?? (sales ?? [])[0]?.tx_at ?? null;

  return NextResponse.json({
    lockers,
    payment: { total_won: totalWon, last_at: lastAt ? String(lastAt).slice(0, 10) : null, count: (sales ?? []).length },
  });
}
