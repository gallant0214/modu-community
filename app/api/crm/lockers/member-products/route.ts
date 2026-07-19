import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/lockers/member-products?member_id=123
 * 선택한 회원이 실제 구매한 락커 상품 목록 (crm_sales product_type='락커').
 * 상품명으로 락커 상품 카탈로그(crm_products)의 기간(duration)을 매칭해 만료일 자동계산에 사용.
 * 구매 이력이 없으면 items: [] 반환.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const memberId = Number(url.searchParams.get("member_id"));
  if (!memberId) return NextResponse.json({ items: [] });

  const { data: sales, error } = await supabase
    .from("crm_sales")
    .select("product_name, tx_at, amount_won")
    .eq("center_id", ctx.centerId)
    .eq("member_id", memberId)
    .eq("product_type", "락커")
    .neq("tx_type", "환불")
    .order("tx_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  // 상품명 → 기간(duration) 매핑 (락커 상품 카탈로그)
  const { data: products } = await supabase
    .from("crm_products")
    .select("name, duration_value, duration_unit")
    .eq("center_id", ctx.centerId)
    .eq("type", "locker");
  const durByName = new Map(
    (products ?? []).map((p) => [p.name, { duration_value: p.duration_value, duration_unit: p.duration_unit }])
  );

  // 상품명 기준 dedupe (가장 최근 구매만)
  const seen = new Set<string>();
  const items: {
    product_name: string;
    purchased_at: string;
    duration_value: number | null;
    duration_unit: string | null;
    amount_won: number;
  }[] = [];
  for (const s of sales ?? []) {
    const name = s.product_name ?? "";
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const dur = durByName.get(name);
    items.push({
      product_name: name,
      purchased_at: (s.tx_at ?? "").slice(0, 10),
      duration_value: dur?.duration_value ?? null,
      duration_unit: dur?.duration_unit ?? null,
      amount_won: s.amount_won ?? 0,
    });
  }

  return NextResponse.json({ items });
}
