import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/contracts/sign/request
 * body: { member_id, template_id?, pass_id?, membership_id? }
 *
 * pending_signature 상태의 crm_signed_contracts 를 만들고 서명용 토큰과 링크를 반환.
 * 회원 앱이 나오기 전엔 이 링크를 SMS/카톡으로 붙여넣어 전달.
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  let body: {
    member_id?: number;
    template_id?: number;
    pass_id?: number;
    membership_id?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const memberId = Number(body.member_id);
  if (!memberId) {
    return NextResponse.json({ error: "회원을 선택해 주세요" }, { status: 400 });
  }

  // 회원 정보
  const { data: member } = await supabase
    .from("crm_members")
    .select("id, name, phone, birth, gender")
    .eq("id", memberId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!member) {
    return NextResponse.json({ error: "회원을 찾을 수 없어요" }, { status: 404 });
  }

  // 템플릿 (선택)
  let title = "피티 회원가입 계약서";
  let termsSnapshot: unknown = [];
  if (body.template_id) {
    const { data: tpl } = await supabase
      .from("crm_contract_templates")
      .select("id, title, body, sections")
      .eq("id", body.template_id)
      .eq("center_id", ctx.centerId)
      .eq("status", "active")
      .maybeSingle();
    if (!tpl) {
      return NextResponse.json({ error: "계약서 양식을 찾을 수 없어요" }, { status: 404 });
    }
    title = tpl.title;
    termsSnapshot =
      Array.isArray(tpl.sections) && tpl.sections.length > 0
        ? tpl.sections
        : [{ key: "default", title: tpl.title, body: tpl.body, required: true }];
  }

  // 수강권/회원권 스냅샷
  let productInfo: unknown = null;
  let paymentInfo: unknown = null;
  if (body.pass_id) {
    const { data: p } = await supabase
      .from("crm_passes")
      .select(
        "lesson_kind, total_sessions, remaining_sessions, session_minutes, price_won, payment_method, payment_method_custom, issued_at, expires_at"
      )
      .eq("id", body.pass_id)
      .eq("center_id", ctx.centerId)
      .maybeSingle();
    if (p) {
      productInfo = {
        lesson_kind: p.lesson_kind,
        total_sessions: p.total_sessions,
        session_minutes: p.session_minutes,
        issued_at: p.issued_at,
        expires_at: p.expires_at,
      };
      paymentInfo = {
        price_won: p.price_won,
        payment_method: p.payment_method,
        payment_method_custom: p.payment_method_custom,
      };
    }
  } else if (body.membership_id) {
    const { data: m } = await supabase
      .from("crm_memberships")
      .select("plan_name, duration_days, price_won, payment_method, payment_method_custom, start_date, expires_at")
      .eq("id", body.membership_id)
      .eq("center_id", ctx.centerId)
      .maybeSingle();
    if (m) {
      productInfo = {
        plan_name: m.plan_name,
        duration_days: m.duration_days,
        start_date: m.start_date,
        expires_at: m.expires_at,
      };
      paymentInfo = {
        price_won: m.price_won,
        payment_method: m.payment_method,
        payment_method_custom: m.payment_method_custom,
      };
    }
  }

  const token = crypto.randomBytes(24).toString("hex");

  const { data: created, error } = await supabase
    .from("crm_signed_contracts")
    .insert({
      center_id: ctx.centerId,
      member_id: memberId,
      pass_id: body.pass_id ?? null,
      membership_id: body.membership_id ?? null,
      title,
      customer_info: {
        name: member.name,
        phone: member.phone,
        birth: member.birth,
        gender:
          member.gender === "M" ? "남" : member.gender === "F" ? "여" : member.gender ?? "",
      } as never,
      product_info: (productInfo ?? {}) as never,
      payment_info: (paymentInfo ?? {}) as never,
      terms_accepted: {} as never,
      terms_snapshot: termsSnapshot as never,
      signature_data_url: null,
      signed_by_uid: null,
      status: "pending_signature",
      signing_token: token,
      requested_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !created) {
    return NextResponse.json(
      { error: "요청 생성 실패", detail: error?.message },
      { status: 500 }
    );
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "contract.request",
    entity_type: "crm_signed_contracts",
    entity_id: created.id,
    payload: { member_id: memberId, template_id: body.template_id ?? null } as never,
  });

  const url = new URL(request.url);
  const origin = url.origin;
  const signUrl = `${origin}/contract/sign/${token}`;

  return NextResponse.json({ ok: true, id: created.id, token, url: signUrl });
}
