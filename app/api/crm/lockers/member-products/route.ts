import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/lockers/member-products?member_id=123
 * 선택한 회원의 **배정 가능한** 락커 이용권(대여권) 목록 → 배정 시 시작일·만료일 자동 입력.
 *
 * 🚨 2026-10-09 변경 (사용자 보고: 만료된 상품·이미 배정된 상품이 선택지로 떴음)
 *   배정 가능 조건을 모두 만족하는 대여권만 내려준다:
 *     1) 락커 대여권 (상품 카탈로그 type=locker 이름 또는 memo 가 '구역…' 으로 시작)
 *     2) status='valid' **그리고 만료일이 오늘 이후** (상태값만 보면 날짜 만료분이 섞인다)
 *     3) 이미 그 회원의 배정된 락커에 쓰이고 있지 않음 (memo 라벨 '○○ 12번 락커 배정' 매칭)
 *     4) 남은 수량(이용권 수 − 배정 수)을 넘지 않음 — 라벨 매칭이 어긋나도 한도를 지킨다
 *   같은 상품을 2개 샀으면 **2줄로** 내려간다(예전엔 상품명으로 중복 제거해 1줄로 합쳐졌음).
 *   과거 이관 매출(crm_sales)은 유효한 대여권이 아니므로 더 이상 섞지 않는다
 *   (이용권 없는 회원은 배정 자체가 차단되므로 선택지로 줄 의미가 없다).
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const memberId = Number(url.searchParams.get("member_id"));
  if (!memberId) return NextResponse.json({ items: [] });

  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  // 락커 상품 카탈로그 (이름 → 기간)
  const { data: products } = await supabase
    .from("crm_products")
    .select("name, duration_value, duration_unit")
    .eq("center_id", ctx.centerId)
    .eq("type", "locker");
  const durByName = new Map(
    (products ?? []).map((p) => [
      p.name,
      { duration_value: p.duration_value, duration_unit: p.duration_unit },
    ])
  );
  const lockerNames = new Set((products ?? []).map((p) => p.name));

  // 회원의 현재 배정 락커 (구역명 + 번호) — 대여권 memo 라벨 매칭용
  const { data: myLockers } = await supabase
    .from("crm_lockers")
    .select("number, crm_locker_zones(name)")
    .eq("center_id", ctx.centerId)
    .eq("assigned_member_id", memberId)
    .eq("state", "assigned");
  const assignedLockers = (myLockers ?? []).map((l) => {
    const zn = Array.isArray(l.crm_locker_zones)
      ? (l.crm_locker_zones[0] as { name?: string } | undefined)
      : (l.crm_locker_zones as { name?: string } | null);
    return { number: Number(l.number), zone: zn?.name ?? "" };
  });

  /** memo 가 이 회원의 '배정된 락커' 를 가리키는지 (예: '남자탈의실 5번 락커 배정') */
  const memoPointsToAssigned = (memo: string) => {
    const m = (memo ?? "").trim();
    if (!m || m.includes("미배정")) return false;
    return assignedLockers.some(
      (l) => m.includes(`${l.number}번`) && (!l.zone || m.includes(l.zone))
    );
  };

  // 유효한(날짜까지 살아있는) 락커 대여권
  const { data: rentals } = await supabase
    .from("crm_rentals")
    .select("id, item_name, start_date, expires_at, price_won, created_at, memo")
    .eq("center_id", ctx.centerId)
    .eq("member_id", memberId)
    .eq("status", "valid")
    .gte("expires_at", today)
    .order("created_at", { ascending: false });

  const lockerRentals = (rentals ?? []).filter((r) => {
    const name = r.item_name ?? "";
    const memo = (r.memo ?? "") as string;
    return !!name && (lockerNames.has(name) || memo.startsWith("구역"));
  });

  // 이미 배정에 쓰인 대여권 제외
  const free = lockerRentals.filter((r) => !memoPointsToAssigned((r.memo ?? "") as string));

  // 라벨이 어긋나 걸러지지 않은 경우를 대비해 남은 수량으로 한 번 더 자른다.
  const available = Math.max(0, lockerRentals.length - assignedLockers.length);

  const items = free.slice(0, available).map((r) => {
    const name = r.item_name ?? "";
    const dur = durByName.get(name);
    return {
      rental_id: r.id,
      product_name: name,
      purchased_at: (r.created_at ?? "").slice(0, 10),
      duration_value: dur?.duration_value ?? null,
      duration_unit: dur?.duration_unit ?? null,
      amount_won: r.price_won ?? 0,
      start_date: r.start_date,
      expires_at: r.expires_at,
    };
  });

  return NextResponse.json({
    items,
    // 화면 안내용 — 이용권은 있는데 모두 사용 중인 경우를 구분해서 알려줄 수 있다
    quota: { rentals: lockerRentals.length, assigned: assignedLockers.length },
  });
}
