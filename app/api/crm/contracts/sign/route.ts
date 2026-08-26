import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForContext, ctxHasPermission } from "@/app/lib/crm-permissions";
import { sanitizeRichContent, stripTags } from "@/app/lib/sanitize";

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
  const staffMemberId = url.searchParams.get("staff_member_id");
  const scope = url.searchParams.get("scope"); // "staff" = 직원 근로계약만, "member" = 회원계약만
  const q = (url.searchParams.get("q") || "").trim();

  let query = supabase
    .from("crm_signed_contracts")
    .select(
      "id, member_id, staff_member_id, pass_id, membership_id, title, customer_info, signed_at, status, signing_token, requested_at, created_at"
    )
    .eq("center_id", ctx.centerId)
    .neq("status", "voided")
    .order("signed_at", { ascending: false })
    .limit(200);
  if (memberId) query = query.eq("member_id", Number(memberId));
  if (staffMemberId) query = query.eq("staff_member_id", Number(staffMemberId));
  if (scope === "staff") query = query.not("staff_member_id", "is", null);
  if (scope === "member") query = query.is("staff_member_id", null);

  // 열람 권한: 직원 계약서는 staff_contracts.view, 회원 계약서는 contracts.member_edit.
  const canStaff = await ctxHasPermission(ctx, "staff_contracts.view");
  const canMember = await ctxHasPermission(ctx, "contracts.member_edit");
  if (!canStaff && !canMember) {
    return NextResponse.json({ error: "계약서 열람 권한이 없습니다" }, { status: 403 });
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  // 권한 없는 종류(직원/회원)의 계약서는 결과에서 제외 (PII·서명 보호)
  let rows = (data ?? []).filter((r) => (r.staff_member_id ? canStaff : canMember));
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
    staff_member_id?: number | null;
    pass_id?: number | null;
    membership_id?: number | null;
    customer_info?: Record<string, unknown>;
    product_info?: Record<string, unknown>;
    payment_info?: Record<string, unknown>;
    terms_accepted?: Record<string, boolean>;
    terms_snapshot?: unknown;
    signature_data_url?: string;
    trainer_signature_data_url?: string;
    trainer_info?: { center_member_id?: number | null; name?: string | null };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  // 직원 근로계약은 staff_contracts.edit, 회원 계약은 contracts.member_edit 권한 필요
  if (body.staff_member_id) {
    if (!(await ctxHasPermission(ctx, "staff_contracts.edit"))) {
      return NextResponse.json({ error: "직원 계약서 작성 권한이 없습니다" }, { status: 403 });
    }
  } else if (!(await ctxHasPermission(ctx, "contracts.member_edit"))) {
    return NextResponse.json({ error: "회원 계약서 작성 권한이 없습니다" }, { status: 403 });
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

  // H3(XSS): 클라이언트가 보낸 약관 스냅샷을 그대로 저장하면 서명계약 열람 시(staff)
  // 저장형 XSS가 됨 → 각 항목 title 태그제거 · body 리치서식 sanitize 후 저장.
  const safeSnapshot = Array.isArray(body.terms_snapshot)
    ? (body.terms_snapshot as Record<string, unknown>[]).map((t) => ({
        ...t,
        ...(typeof t.title === "string" ? { title: stripTags(t.title) } : {}),
        ...(typeof t.body === "string" ? { body: sanitizeRichContent(t.body) } : {}),
      }))
    : (body.terms_snapshot ?? {});

  const insertRow = {
    center_id: ctx.centerId,
    member_id: body.member_id ?? null,
    staff_member_id: body.staff_member_id ?? null,
    pass_id: body.pass_id ?? null,
    membership_id: body.membership_id ?? null,
    title: stripTags(body.title?.trim() || "피티 회원가입 계약서"),
    customer_info: body.customer_info ?? {},
    product_info: body.product_info ?? {},
    payment_info: body.payment_info ?? {},
    terms_accepted: body.terms_accepted ?? {},
    terms_snapshot: safeSnapshot,
    signature_data_url: body.signature_data_url,
    trainer_signature_data_url:
      body.trainer_signature_data_url &&
      body.trainer_signature_data_url.startsWith("data:image/")
        ? body.trainer_signature_data_url
        : null,
    trainer_info: body.trainer_info ?? null,
    signed_by_uid: ctx.uid,
    status: "signed",
  };
  const { data: created, error } = await supabase
    .from("crm_signed_contracts")
    .insert(insertRow as never)
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
