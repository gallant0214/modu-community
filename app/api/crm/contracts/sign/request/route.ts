import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { sendPushToMember } from "@/app/lib/member-notify";
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
    staff_member_id?: number;
    template_id?: number;
    pass_id?: number;
    membership_id?: number;
    /** true 면 회원 앱으로 계약서 작성 요청 푸시 발송 */
    notify_app?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const memberId = Number(body.member_id) || 0;
  const staffMemberId = Number(body.staff_member_id) || 0;
  if (!memberId && !staffMemberId) {
    return NextResponse.json({ error: "대상을 선택해 주세요" }, { status: 400 });
  }

  // 대상 정보 (회원 또는 직원)
  let member: { id: number; name: string; phone: string | null; birth: string | null; gender: string | null } | null = null;
  if (staffMemberId) {
    const { data: s } = await supabase
      .from("crm_center_members")
      .select("id, display_name, phone")
      .eq("id", staffMemberId)
      .eq("center_id", ctx.centerId)
      .maybeSingle();
    if (!s) return NextResponse.json({ error: "직원을 찾을 수 없어요" }, { status: 404 });
    member = { id: s.id, name: s.display_name, phone: s.phone ?? null, birth: null, gender: null };
  } else {
    const { data: m } = await supabase
      .from("crm_members")
      .select("id, name, phone, birth, gender")
      .eq("id", memberId)
      .eq("center_id", ctx.centerId)
      .maybeSingle();
    if (!m) return NextResponse.json({ error: "회원을 찾을 수 없어요" }, { status: 404 });
    member = m;
  }

  // 템플릿 필수 — 회원이 서명 화면에서 계약서 내용을 볼 수 있어야 하므로
  if (!body.template_id) {
    return NextResponse.json(
      { error: "계약서 양식을 선택해 주세요" },
      { status: 400 }
    );
  }
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
  const title = tpl.title;

  // 1) sections 컬럼이 있으면 그대로 사용
  // 2) 없으면 body 안의 [제목] 헤더로 자동 분리 (구버전 단일 body 템플릿 호환)
  // 3) 그것도 실패하면 body 전체를 단일 섹션으로
  const parseSectionsFromBody = (rawBody: string) => {
    if (!rawBody) return [];
    const lines = rawBody.split("\n");
    const parsed: { key: string; title: string; body: string; required: boolean }[] = [];
    let currentTitle = "";
    let currentBody: string[] = [];
    let index = 0;
    const push = () => {
      const bodyText = currentBody.join("\n").trim();
      if (currentTitle || bodyText) {
        // 광고성 관련은 선택, 나머지는 필수 (일반적인 관행)
        const isOptional = /광고/.test(currentTitle);
        parsed.push({
          key: `s${index + 1}`,
          title: currentTitle || `섹션 ${index + 1}`,
          body: bodyText,
          required: !isOptional,
        });
        index += 1;
      }
    };
    for (const line of lines) {
      const m = line.match(/^\s*\[(.+?)\]\s*$/);
      if (m) {
        push();
        currentTitle = m[1].trim();
        currentBody = [];
      } else {
        currentBody.push(line);
      }
    }
    push();
    return parsed;
  };

  let termsSnapshot: { key: string; title: string; body: string; required: boolean }[] =
    Array.isArray(tpl.sections) && tpl.sections.length > 0
      ? (tpl.sections as { key: string; title: string; body: string; required: boolean }[])
      : parseSectionsFromBody(tpl.body ?? "");

  if (termsSnapshot.length === 0) {
    termsSnapshot = [
      {
        key: "default",
        title: tpl.title,
        body: tpl.body ?? "",
        required: true,
      },
    ];
  }
  const hasContent = termsSnapshot.some((s) => (s.body ?? "").trim().length > 0);
  if (!hasContent) {
    return NextResponse.json(
      { error: "선택한 양식에 본문이 비어 있어요. 양식을 편집한 뒤 다시 요청해 주세요." },
      { status: 400 }
    );
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
      member_id: staffMemberId ? null : memberId,
      staff_member_id: staffMemberId || null,
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

  // 회원 앱으로 계약서 작성 요청 푸시. 연동 계정(uid) 기준으로 토큰을 찾아 발송하고,
  // 실제 발송된 토큰 수(sent)로 알림 전송 여부를 판단(다중센터 등 member_id 어긋남 방지).
  let notified = false;
  if (body.notify_app) {
    const sent = await sendPushToMember(
      memberId,
      "contract_request",
      "전자 계약서 작성 요청",
      "작성할 전자 계약서가 도착했어요. 눌러서 약관 동의와 서명을 완료해 주세요.",
      { url: signUrl, contract_id: String(created.id), token }
    );
    notified = sent > 0;
  }

  return NextResponse.json({ ok: true, id: created.id, token, url: signUrl, notified });
}
