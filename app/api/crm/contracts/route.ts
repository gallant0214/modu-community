import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

const CATEGORIES = ["purchase", "transfer", "refund", "employment", "etc"] as const;
type Category = (typeof CATEGORIES)[number];

/**
 * GET /api/crm/contracts
 *   ?category=  (없으면 전체)
 *   ?q=         (제목 부분 일치)
 *   ?sort=      (name_asc | name_desc | newest | oldest, 기본 newest)
 *
 * 모든 직원이 조회 가능 (계약서 보기/쓰기를 위해).
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const q = (url.searchParams.get("q") || "").trim();
  const sort = url.searchParams.get("sort") || "newest";

  let query = supabase
    .from("crm_contract_templates")
    .select("id, category, title, created_by_uid, created_at, updated_at")
    .eq("center_id", ctx.centerId)
    .eq("status", "active");

  if (category && CATEGORIES.includes(category as Category)) {
    query = query.eq("category", category);
  }
  if (q) {
    query = query.ilike("title", `%${q}%`);
  }
  if (sort === "name_asc") query = query.order("title", { ascending: true });
  else if (sort === "name_desc") query = query.order("title", { ascending: false });
  else if (sort === "oldest") query = query.order("created_at", { ascending: true });
  else query = query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ contracts: data ?? [] });
}

/**
 * POST /api/crm/contracts — 새 계약서 템플릿 작성. owner/admin 만.
 * body: { title, category, body? }
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  let body: { title?: string; category?: string; body?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const title = body.title?.trim();
  if (!title) return NextResponse.json({ error: "계약서 제목을 입력해주세요" }, { status: 400 });

  const category = body.category;
  if (!category || !CATEGORIES.includes(category as Category)) {
    return NextResponse.json({ error: "카테고리 값이 잘못됨" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("crm_contract_templates")
    .insert({
      center_id: ctx.centerId,
      category,
      title,
      body: body.body ?? "",
      created_by_uid: ctx.uid,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "작성 실패", detail: error?.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "contract.create",
    entity_type: "crm_contract_templates",
    entity_id: data.id,
    payload: { title, category } as never,
  });

  return NextResponse.json({ ok: true, id: data.id });
}
