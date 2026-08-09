import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * 단일 body 안에 "^\[제목\]$" 헤더가 여러 개 있으면 섹션 배열로 분리.
 * 구버전 템플릿 호환용.
 */
function parseSectionsFromBody(rawBody: string) {
  if (!rawBody) return [];
  const lines = rawBody.split("\n");
  const parsed: { key: string; title: string; body: string; required: boolean }[] = [];
  let currentTitle = "";
  let currentBody: string[] = [];
  let idx = 0;
  const push = () => {
    const bodyText = currentBody.join("\n").trim();
    if (currentTitle || bodyText) {
      const isOptional = /광고/.test(currentTitle);
      parsed.push({
        key: `s${idx + 1}`,
        title: currentTitle || `섹션 ${idx + 1}`,
        body: bodyText,
        required: !isOptional,
      });
      idx += 1;
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
}

/**
 * 이미 저장된 terms_snapshot 을 표시용으로 보정.
 * 단일 섹션에 [제목] 헤더가 여러 개 들어있는 구버전 스냅샷을 자동 분리.
 */
function normalizeSnapshot(snapshot: unknown): {
  key: string;
  title: string;
  body: string;
  required: boolean;
}[] {
  if (!Array.isArray(snapshot)) return [];
  const arr = snapshot as { key?: string; title?: string; body?: string; required?: boolean }[];
  // 단일 항목이고 body 안에 [헤더] 라인이 2개 이상이면 자동 분리
  if (arr.length === 1 && (arr[0]?.body ?? "").length > 0) {
    const headerCount = (arr[0].body!.match(/^\s*\[.+?\]\s*$/gm) ?? []).length;
    if (headerCount >= 2) {
      const parsed = parseSectionsFromBody(arr[0].body!);
      if (parsed.length >= 2) return parsed;
    }
  }
  return arr.map((s, i) => ({
    key: s.key || `s${i + 1}`,
    title: s.title || `섹션 ${i + 1}`,
    body: s.body ?? "",
    required: s.required !== false,
  }));
}

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

  const normalized = normalizeSnapshot(data.terms_snapshot);
  return NextResponse.json({
    contract: { ...data, terms_snapshot: normalized },
  });
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

  // 필수 약관 검증 (GET 과 동일하게 자동 분리한 스냅샷 기준)
  const snapshot = normalizeSnapshot(existing.terms_snapshot);
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

  // 신원 정보(이름/전화/생년/성별 등)는 센터가 등록한 값을 그대로 유지한다.
  // 서명자가 body.customer_info 로 계약서 신원 필드를 덮어쓰지 못하게 병합하지 않는다.
  const finalCustomer = existing.customer_info ?? {};

  const { error } = await supabase
    .from("crm_signed_contracts")
    .update({
      customer_info: finalCustomer as never,
      terms_accepted: (body.terms_accepted ?? {}) as never,
      // 자동 분리된 최종 스냅샷을 저장해 상세 페이지에서도 동일하게 보이도록
      terms_snapshot: snapshot as never,
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
