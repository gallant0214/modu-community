import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * 회원 서명용 공개 엔드포인트 (인증 없이 token 만으로 접근).
 * signing_token 이 발급된 pending_signature 계약서에만 유효.
 */

/**
 * GET /api/contract/sign/[token] — 서명 화면용 데이터 반환.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || token.length < 32) {
    return NextResponse.json({ error: "잘못된 링크에요" }, { status: 400 });
  }

  const { data } = await supabase
    .from("crm_signed_contracts")
    .select(
      "id, title, status, customer_info, product_info, payment_info, terms_snapshot, terms_accepted, signed_at"
    )
    .eq("signing_token", token)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ error: "링크가 만료되었거나 잘못됐어요" }, { status: 404 });
  }
  if (data.status === "voided") {
    return NextResponse.json({ error: "무효 처리된 계약서에요" }, { status: 410 });
  }
  return NextResponse.json({ contract: data });
}

/**
 * POST /api/contract/sign/[token] — 회원이 서명 완료.
 * body: { customer_info?, terms_accepted, signature_data_url }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || token.length < 32) {
    return NextResponse.json({ error: "잘못된 링크에요" }, { status: 400 });
  }

  let body: {
    customer_info?: Record<string, unknown>;
    terms_accepted?: Record<string, boolean>;
    signature_data_url?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("crm_signed_contracts")
    .select("id, status, customer_info, terms_snapshot")
    .eq("signing_token", token)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "링크가 만료되었거나 잘못됐어요" }, { status: 404 });
  }
  if (existing.status === "signed") {
    return NextResponse.json({ error: "이미 서명이 완료된 계약서에요" }, { status: 409 });
  }
  if (existing.status === "voided") {
    return NextResponse.json({ error: "무효 처리된 계약서에요" }, { status: 410 });
  }
  if (!body.signature_data_url || !body.signature_data_url.startsWith("data:image/")) {
    return NextResponse.json({ error: "서명이 필요해요" }, { status: 400 });
  }

  // 필수 약관 검증
  const snapshot = Array.isArray(existing.terms_snapshot)
    ? (existing.terms_snapshot as { key: string; title?: string; body?: string; required: boolean }[])
    : [];
  if (snapshot.length === 0) {
    return NextResponse.json(
      { error: "계약서 본문이 없어요. 센터에 다시 링크를 요청해 주세요." },
      { status: 400 }
    );
  }
  const hasContent = snapshot.some((s) => (s?.body ?? "").trim().length > 0);
  if (!hasContent) {
    return NextResponse.json(
      { error: "계약서 본문이 비어 있어요. 센터에 다시 링크를 요청해 주세요." },
      { status: 400 }
    );
  }
  const requiredKeys = snapshot.filter((s) => s?.required).map((s) => s.key);
  if (requiredKeys.length === 0) {
    return NextResponse.json(
      { error: "필수 약관이 지정되지 않았어요. 센터에 문의해 주세요." },
      { status: 400 }
    );
  }
  for (const s of snapshot.filter((x) => x?.required)) {
    if (!body.terms_accepted?.[s.key]) {
      const label = s.title ? `필수 약관(${s.title})` : "필수 약관";
      return NextResponse.json({ error: `${label}에 동의해 주세요` }, { status: 400 });
    }
  }

  const mergedCustomer = {
    ...(existing.customer_info ?? {}),
    ...(body.customer_info ?? {}),
  };

  const { error } = await supabase
    .from("crm_signed_contracts")
    .update({
      customer_info: mergedCustomer as never,
      terms_accepted: (body.terms_accepted ?? {}) as never,
      signature_data_url: body.signature_data_url,
      signed_at: new Date().toISOString(),
      status: "signed",
      // 서명 완료 후엔 링크를 재사용 못 하게 토큰 무효화
      signing_token: null,
    } as never)
    .eq("id", existing.id);

  if (error) {
    return NextResponse.json({ error: "저장 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: existing.id });
}
