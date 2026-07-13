import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

const TYPES = ["membership", "group", "personal", "locker", "apparel", "goods"] as const;
const BILLING = ["period", "count"] as const;
const UNITS = ["day", "month", "year"] as const;

/**
 * GET /api/crm/products?type=&q=
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const q = (url.searchParams.get("q") || "").trim();

  let query = supabase
    .from("crm_products")
    .select(
      "id, type, billing_mode, category, name, description, open_time, close_time, operating_days, duration_value, duration_unit, service_days, total_sessions, pause_enabled, pause_days, pause_count, price_won, vat_included, mileage_earn, mileage_usable, capacity, session_minutes, status, created_at"
    )
    .eq("center_id", ctx.centerId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  // 필터 시엔 커스텀 유형도 허용 (센터별로 다르니 문자열 매칭)
  if (type) {
    query = query.eq("type", type);
  }
  if (q) {
    query = query.ilike("name", `%${q}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ products: data ?? [] });
}

/**
 * POST /api/crm/products — 상품 추가. owner/admin/manager 까지 허용.
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  let body: {
    type?: string;
    billing_mode?: string;
    category?: string;
    name?: string;
    description?: string;
    open_time?: string;
    close_time?: string;
    operating_days?: number[];
    duration_value?: number;
    duration_unit?: string;
    service_days?: number;
    total_sessions?: number;
    pause_enabled?: boolean;
    pause_days?: number;
    pause_count?: number;
    price_won?: number;
    vat_included?: boolean;
    mileage_earn?: number;
    mileage_usable?: boolean;
    capacity?: number;
    session_minutes?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  if (!body.type) {
    return NextResponse.json({ error: "상품 유형을 선택해 주세요" }, { status: 400 });
  }
  const isBuiltIn = TYPES.includes(body.type as (typeof TYPES)[number]);
  if (!isBuiltIn) {
    // 센터에 등록된 커스텀 유형인지 확인
    const { data: custom } = await supabase
      .from("crm_product_types")
      .select("key")
      .eq("center_id", ctx.centerId)
      .eq("key", body.type)
      .eq("status", "active")
      .maybeSingle();
    if (!custom) {
      return NextResponse.json({ error: "등록되지 않은 상품 유형이에요" }, { status: 400 });
    }
  }
  const billingMode =
    body.billing_mode && BILLING.includes(body.billing_mode as (typeof BILLING)[number])
      ? body.billing_mode
      : "period";

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "상품명을 입력해 주세요" }, { status: 400 });

  const durationUnit =
    body.duration_unit && UNITS.includes(body.duration_unit as (typeof UNITS)[number])
      ? body.duration_unit
      : "month";

  const days = (body.operating_days ?? [0, 1, 2, 3, 4, 5, 6]).filter(
    (d) => Number.isInteger(d) && d >= 0 && d <= 6
  );

  const { data: created, error } = await supabase
    .from("crm_products")
    .insert({
      center_id: ctx.centerId,
      type: body.type,
      billing_mode: billingMode,
      category: body.category?.trim() || null,
      name,
      description: body.description?.trim() || null,
      open_time: body.open_time || "00:00",
      close_time: body.close_time || "23:59",
      operating_days: days.length > 0 ? days : [0, 1, 2, 3, 4, 5, 6],
      duration_value: body.duration_value ?? 0,
      duration_unit: durationUnit,
      service_days: body.service_days ?? 0,
      total_sessions: body.total_sessions ?? 0,
      pause_enabled: !!body.pause_enabled,
      pause_days: body.pause_days ?? 0,
      pause_count: body.pause_enabled ? Math.max(0, Number(body.pause_count) || 0) : 0,
      price_won: Number(body.price_won) || 0,
      vat_included: !!body.vat_included,
      mileage_earn: Math.max(0, Number(body.mileage_earn) || 0),
      mileage_usable: body.mileage_usable !== false,
      capacity: body.type === "group" ? Math.max(0, Number(body.capacity) || 0) : 0,
      session_minutes:
        body.type === "personal" || body.type === "group"
          ? Math.max(0, Number(body.session_minutes) || 0)
          : 0,
      status: "active",
    })
    .select("id")
    .single();

  if (error || !created) {
    return NextResponse.json({ error: "추가 실패", detail: error?.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "product.create",
    entity_type: "crm_products",
    entity_id: created.id,
    payload: { name, type: body.type } as never,
  });

  return NextResponse.json({ ok: true, id: created.id });
}
