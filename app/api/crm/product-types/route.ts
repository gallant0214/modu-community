import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/product-types
 * 센터가 등록한 커스텀 상품 유형 목록 (활성만).
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { data, error } = await supabase
    .from("crm_product_types")
    .select("id, key, label, color, sort_order")
    .eq("center_id", ctx.centerId)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ types: data ?? [] });
}

/**
 * POST /api/crm/product-types
 * Body: { label, key?, color? }
 *   - label 필수
 *   - key 미제공 시 label 을 소문자·공백 제거·랜덤 접미사로 자동 생성
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  let body: { label?: string; key?: string; color?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const label = body.label?.trim();
  if (!label) return NextResponse.json({ error: "유형 이름을 입력해 주세요" }, { status: 400 });
  if (label.length > 20)
    return NextResponse.json({ error: "유형 이름은 20자 이내" }, { status: 400 });

  const BUILT_IN_KEYS = new Set([
    "membership",
    "group",
    "personal",
    "locker",
    "apparel",
    "goods",
  ]);
  const explicitKey = (body.key ?? "").trim().toLowerCase();
  const isBuiltinKey = explicitKey && BUILT_IN_KEYS.has(explicitKey);

  // 기본 유형 label 오버라이드가 아니면, 기본 유형 이름 중복 방지
  if (!isBuiltinKey) {
    const RESERVED = ["회원권", "그룹 수업", "그룹수업", "개인 레슨", "개인레슨", "락커", "운동복", "운동 용품", "운동용품"];
    if (RESERVED.includes(label)) {
      return NextResponse.json({ error: "이미 기본 유형에 있어요" }, { status: 400 });
    }
  }

  // key 결정
  let key = explicitKey.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!key) {
    key = `t${Math.floor(Math.random() * 1000000).toString(36)}${Date.now().toString(36).slice(-4)}`;
  }

  const color = body.color?.trim() || null;

  // 기본 유형 오버라이드는 upsert (재발 시 label 갱신), 커스텀은 순수 insert
  const query = isBuiltinKey
    ? supabase
        .from("crm_product_types")
        .upsert(
          {
            center_id: ctx.centerId,
            key,
            label,
            color,
            status: "active",
          } as never,
          { onConflict: "center_id,key" }
        )
        .select("id, key, label, color, sort_order")
        .single()
    : supabase
        .from("crm_product_types")
        .insert({
          center_id: ctx.centerId,
          key,
          label,
          color,
          status: "active",
        } as never)
        .select("id, key, label, color, sort_order")
        .single();

  const { data, error } = await query;

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "이미 같은 유형이 있어요" }, { status: 409 });
    }
    return NextResponse.json({ error: "추가 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ type: data });
}
