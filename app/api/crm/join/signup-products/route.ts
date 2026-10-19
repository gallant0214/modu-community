import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/join/signup-products?token=  (공개·무인증)
 * 신규 회원 웹 가입 화면에 노출할 상품 — 센터의 signup_enabled=true 상품을
 * 종류별(회원권=헬스이용권 / 운동복=apparel / 락커=locker)로 반환.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "가입 링크가 필요합니다" }, { status: 400 });

  const { data: link } = await supabase
    .from("crm_center_join_links")
    .select("center_id")
    .eq("token", token)
    .maybeSingle();
  if (!link) return NextResponse.json({ error: "유효하지 않은 가입 링크예요" }, { status: 404 });

  const { data: center } = await supabase
    .from("crm_centers")
    .select("id, name, status")
    .eq("id", link.center_id)
    .maybeSingle();
  if (!center || center.status !== "active") {
    return NextResponse.json({ error: "센터를 찾을 수 없어요" }, { status: 404 });
  }

  const { data: products, error } = await supabase
    .from("crm_products")
    .select("id, type, name, price_won, vat_included, duration_value, duration_unit")
    .eq("center_id", center.id)
    .eq("signup_enabled", true)
    .eq("status", "active")
    .in("type", ["membership", "apparel", "locker"])
    .order("duration_value", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "상품 조회 실패", detail: error.message }, { status: 500 });
  }

  type P = {
    id: number;
    type: string;
    name: string;
    price_won: number | null;
    vat_included: boolean | null;
    duration_value: number | null;
    duration_unit: string | null;
  };
  const list = (products ?? []) as P[];
  const map = (t: string) =>
    list
      .filter((p) => p.type === t)
      .map((p) => ({
        id: p.id,
        name: p.name,
        price_won: p.price_won ?? 0,
        vat_included: !!p.vat_included,
        duration_value: p.duration_value ?? 0,
        duration_unit: p.duration_unit ?? "month",
      }));

  return NextResponse.json({
    centerId: center.id,
    centerName: center.name,
    memberships: map("membership"), // 헬스 이용권
    apparel: map("apparel"), // 운동복
    lockers: map("locker"), // 락커
  });
}
