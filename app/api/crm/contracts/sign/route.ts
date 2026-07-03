import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/contracts/sign?member_id=&q=
 * 서명된 계약서 목록 (signature_data_url 은 제외해 크기 줄임).
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const memberId = url.searchParams.get("member_id");
  const q = (url.searchParams.get("q") || "").trim();

  let query = supabase
    .from("crm_signed_contracts")
    .select(
      "id, member_id, pass_id, membership_id, title, customer_info, signed_at, status, signing_token, requested_at, created_at"
    )
    .eq("center_id", ctx.centerId)
    .neq("status", "voided")
    .order("signed_at", { ascending: false })
    .limit(200);
  if (memberId) query = query.eq("member_id", Number(memberId));

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  let rows = data ?? [];
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((r) => {
      const info = (r.customer_info ?? {}) as { name?: string; phone?: string };
      return (
        (info.name || "").toLowerCase().includes(needle) ||
        (info.phone || "").replace(/-/g, "").includes(needle.replace(/-/g, ""))
      );
    });
  }
  return NextResponse.json({ contracts: rows });
}

/**
 * POST /api/crm/contracts/sign
 * 새 서명 계약서를 저장. 회원/수강권/회원권은 모두 옵션.
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  let body: {
    title?: string;
    member_id?: number | null;
    pass_id?: number | null;
    membership_id?: number | null;
    customer_info?: Record<string, unknown>;
    product_info?: Record<string, unknown>;
    payment_info?: Record<string, unknown>;
    terms_accepted?: Record<string, boolean>;
    terms_snapshot?: unknown;
    signature_data_url?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const name = (body.customer_info?.name as string | undefined)?.trim();
  if (!name) {
    return NextResponse.json({ error: "고객 이름을 입력해 주세요" }, { status: 400 });
  }
  if (!body.signature_data_url || !body.signature_data_url.startsWith("data:image/")) {
    return NextResponse.json({ error: "서명이 필요합니다" }, { status: 400 });
  }
  // 필수 약관 검증: terms_snapshot 의 required:true 항목 모두 accepted 여야 함
  const snapshot = Array.isArray(body.terms_snapshot)
    ? (body.terms_snapshot as { key: string; required: boolean }[])
    : [];
  const requiredKeys = snapshot.filter((t) => t?.required).map((t) => t.key);
  for (const k of requiredKeys) {
    if (!body.terms_accepted?.[k]) {
      return NextResponse.json({ error: `필수 약관(${k}) 에 동의해 주세요` }, { status: 400 });
    }
  }

  const { data: created, error } = await supabase
    .from("crm_signed_contracts")
    .insert({
      center_id: ctx.centerId,
      member_id: body.member_id ?? null,
      pass_id: body.pass_id ?? null,
      membership_id: body.membership_id ?? null,
      title: body.title?.trim() || "피티 회원가입 계약서",
      customer_info: (body.customer_info ?? {}) as never,
      product_info: (body.product_info ?? {}) as never,
      payment_info: (body.payment_info ?? {}) as never,
      terms_accepted: (body.terms_accepted ?? {}) as never,
      terms_snapshot: (body.terms_snapshot ?? {}) as never,
      signature_data_url: body.signature_data_url,
      signed_by_uid: ctx.uid,
      status: "signed",
    })
    .select("id")
    .single();
  if (error || !created) {
    return NextResponse.json({ error: "저장 실패", detail: error?.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "contract.sign",
    entity_type: "crm_signed_contracts",
    entity_id: created.id,
    payload: { name, member_id: body.member_id ?? null } as never,
  });

  return NextResponse.json({ ok: true, id: created.id });
}
