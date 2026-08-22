import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/lockers/member-products?member_id=123
 * 선택한 회원이 결제한 락커 상품(대여권) 목록 → 락커 배정 시 시작일·만료일 자동 입력.
 *
 * 소스 = crm_rentals(실제 대여권, 결제 시 지정한 start_date/expires_at 보유).
 *   락커 대여권 식별: item_name 이 락커 상품 카탈로그(crm_products type=locker) 이름과 일치하거나
 *   memo 가 '구역'(구역 미배정 / 구역 N번)으로 시작.
 * 과거 이관분(crm_sales product_type='락커') 중 대여권이 없는 항목은 날짜 없이 보완.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const memberId = Number(url.searchParams.get("member_id"));
  if (!memberId) return NextResponse.json({ items: [] });

  // 락커 상품 카탈로그 (이름 → 기간)
  const { data: products } = await supabase
    .from("crm_products")
    .select("name, duration_value, duration_unit")
    .eq("center_id", ctx.centerId)
    .eq("type", "locker");
  const durByName = new Map(
    (products ?? []).map((p) => [p.name, { duration_value: p.duration_value, duration_unit: p.duration_unit }])
  );
  const lockerNames = new Set((products ?? []).map((p) => p.name));

  type Item = {
    product_name: string;
    purchased_at: string;
    duration_value: number | null;
    duration_unit: string | null;
    amount_won: number;
    start_date: string | null;
    expires_at: string | null;
  };
  const items: Item[] = [];
  const seen = new Set<string>();

  // 1) 실제 대여권(crm_rentals) — 라이브 결제의 신뢰 소스
  const { data: rentals } = await supabase
    .from("crm_rentals")
    .select("item_name, start_date, expires_at, price_won, created_at, memo")
    .eq("center_id", ctx.centerId)
    .eq("member_id", memberId)
    .eq("status", "valid")
    .order("created_at", { ascending: false });
  for (const r of rentals ?? []) {
    const name = r.item_name ?? "";
    const memo = (r.memo ?? "") as string;
    const isLocker = lockerNames.has(name) || memo.startsWith("구역");
    if (!name || !isLocker || seen.has(name)) continue;
    seen.add(name);
    const dur = durByName.get(name);
    items.push({
      product_name: name,
      purchased_at: (r.created_at ?? "").slice(0, 10),
      duration_value: dur?.duration_value ?? null,
      duration_unit: dur?.duration_unit ?? null,
      amount_won: r.price_won ?? 0,
      start_date: r.start_date,
      expires_at: r.expires_at,
    });
  }

  // 2) 과거 이관분(crm_sales product_type='락커') 중 대여권이 없는 상품명만 보완(날짜 없음)
  const { data: sales } = await supabase
    .from("crm_sales")
    .select("product_name, tx_at, amount_won")
    .eq("center_id", ctx.centerId)
    .eq("member_id", memberId)
    .eq("product_type", "락커")
    .neq("tx_type", "환불")
    .order("tx_at", { ascending: false });
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
      start_date: null,
      expires_at: null,
    });
  }

  return NextResponse.json({ items });
}
