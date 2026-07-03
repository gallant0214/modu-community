import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/contract-categories — 센터가 등록한 커스텀 카테고리.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { data, error } = await supabase
    .from("crm_contract_categories")
    .select("id, key, label, sort_order")
    .eq("center_id", ctx.centerId)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ categories: data ?? [] });
}

/**
 * POST /api/crm/contract-categories — 커스텀 카테고리 추가.
 * body: { label } → key 자동 생성.
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  let body: { label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const label = body.label?.trim();
  if (!label) return NextResponse.json({ error: "카테고리 이름을 입력해 주세요" }, { status: 400 });
  if (label.length > 20) return NextResponse.json({ error: "20자 이내" }, { status: 400 });

  const RESERVED = ["구매 계약서", "양도 계약서", "환불 계약서", "근로 계약서", "기타 계약서"];
  if (RESERVED.includes(label)) {
    return NextResponse.json({ error: "이미 기본 카테고리에 있어요" }, { status: 400 });
  }

  const key = `c${Math.floor(Math.random() * 1000000).toString(36)}${Date.now().toString(36).slice(-4)}`;

  const { data, error } = await supabase
    .from("crm_contract_categories")
    .insert({
      center_id: ctx.centerId,
      key,
      label,
      status: "active",
    })
    .select("id, key, label")
    .single();

  if (error) {
    return NextResponse.json({ error: "추가 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ category: data });
}
