import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

const TYPES = ["membership", "group", "personal", "locker", "apparel", "goods"] as const;
const BILLING = ["period", "count"] as const;
const UNITS = ["day", "month", "year"] as const;

/** 묶음(번들) 구성 상품 정규화. duration_value(일) 또는 total_sessions(회) 가 있어야 유효 */
export function sanitizeComponents(input: unknown): {
  type: string;
  name: string;
  price_won: number;
  billing_mode: string;
  duration_value: number;
  duration_unit: string;
  total_sessions: number;
  session_minutes: number;
}[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 20)
    .map((c) => {
      const o = (c ?? {}) as Record<string, unknown>;
      return {
        type: typeof o.type === "string" ? o.type : "membership",
        name: typeof o.name === "string" ? o.name.slice(0, 60) : "",
        price_won: Math.max(0, Math.floor(Number(o.price_won) || 0)),
        billing_mode: o.billing_mode === "count" ? "count" : "period",
        duration_value: Math.max(0, Math.floor(Number(o.duration_value) || 0)),
        // 기간제 단위(일/개월/년). 기본 일.
        duration_unit: ["day", "month", "year"].includes(String(o.duration_unit))
          ? String(o.duration_unit)
          : "day",
        total_sessions: Math.max(0, Math.floor(Number(o.total_sessions) || 0)),
        session_minutes: Math.max(0, Math.floor(Number(o.session_minutes) || 0)),
      };
    })
    .filter((c) => c.duration_value > 0 || c.total_sessions > 0);
}

/**
 * GET /api/crm/products?type=&q=&scope=center|personal
 *
 * scope 기본값 = 'center' (기존 동작).
 * scope='personal' → 로그인 강사(ctx.centerMemberId)가 등록한 개인 상품만 반환.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const q = (url.searchParams.get("q") || "").trim();
  const scope = url.searchParams.get("scope") === "personal" ? "personal" : "center";

  let query = supabase
    .from("crm_products")
    .select(
      "id, type, billing_mode, category, name, description, open_time, close_time, operating_days, duration_value, duration_unit, service_days, total_sessions, pause_enabled, pause_days, pause_count, price_won, vat_included, mileage_earn, mileage_usable, attendance_mileage_earn, capacity, session_minutes, daily_check_in_limit, daily_time_limit_enabled, components, trainer_member_id, status, created_at"
    )
    .eq("center_id", ctx.centerId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (scope === "personal") {
    query = query.eq("trainer_member_id", ctx.centerMemberId);
  } else {
    query = query.is("trainer_member_id", null);
  }

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
    attendance_mileage_earn?: number;
    capacity?: number;
    session_minutes?: number;
    daily_check_in_limit?: number;
    daily_time_limit_enabled?: boolean;
    components?: unknown;
    scope?: string;
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

  const isPersonalScope = body.scope === "personal";
  // 개인 상품 등록 시엔 커스텀 유형 이슈 방지 위해 pass 계열만 허용 (수강권 = personal/group)
  if (isPersonalScope && !(body.type === "personal" || body.type === "group")) {
    return NextResponse.json(
      { error: "개인 상품은 개인 레슨 또는 그룹 수업 유형만 등록할 수 있어요" },
      { status: 400 }
    );
  }

  const { data: created, error } = await supabase
    .from("crm_products")
    .insert({
      center_id: ctx.centerId,
      trainer_member_id: isPersonalScope ? ctx.centerMemberId : null,
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
      attendance_mileage_earn: Math.max(0, Number(body.attendance_mileage_earn) || 0),
      capacity: body.type === "group" ? Math.max(0, Number(body.capacity) || 0) : 0,
      session_minutes:
        body.type === "personal" || body.type === "group"
          ? Math.max(0, Number(body.session_minutes) || 0)
          : 0,
      // 0 = 무제한 sentinel (회원권 UI에서 '무제한' 체크 시). 그 외엔 ≥1 강제.
      daily_check_in_limit:
        Number(body.daily_check_in_limit) === 0
          ? 0
          : Math.max(1, Number(body.daily_check_in_limit) || 1),
      daily_time_limit_enabled: !!body.daily_time_limit_enabled,
      components: sanitizeComponents(body.components),
      status: "active",
    } as never)
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
