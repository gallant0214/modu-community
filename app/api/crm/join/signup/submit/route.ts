import { errLogOnly } from "@/app/lib/api-error";
import { NextResponse } from "next/server";
import { getClientIp, checkRateLimit } from "@/app/lib/security";
import { supabase } from "@/app/lib/supabase";
import {
  onlineSalesEnabled,
  SALES_DISABLED_MESSAGE,
  memberPgProvider,
} from "@/app/lib/member-checkout";
import { portoneConfigured } from "@/app/lib/portone-payments";
import { tossKeysMatch } from "@/app/lib/toss-payments";
import { signOrderToken, verifyJoinMemberToken } from "@/app/lib/order-token";
import { payPath, payPathSlugForCenter } from "@/app/lib/pay-path";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Section {
  key: string;
  title: string;
  body: string;
  required: boolean;
}
function parseSectionsFromBody(rawBody: string): Section[] {
  if (!rawBody) return [];
  const parsed: Section[] = [];
  let title = "";
  let bodyLines: string[] = [];
  let i = 0;
  const push = () => {
    const b = bodyLines.join("\n").trim();
    if (title || b) {
      parsed.push({ key: `s${i + 1}`, title: title || `섹션 ${i + 1}`, body: b, required: !/광고/.test(title) });
      i += 1;
    }
  };
  for (const line of rawBody.split("\n")) {
    const m = line.match(/^\s*\[(.+?)\]\s*$/);
    if (m) {
      push();
      title = m[1].trim();
      bodyLines = [];
    } else bodyLines.push(line);
  }
  push();
  return parsed;
}

const normPhone = (v: string) => {
  const d = (v || "").replace(/\D/g, "").slice(0, 11);
  if (d.length < 8) return d;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
};
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

/**
 * POST /api/crm/join/signup/submit  (공개·무인증 — QR 가입 링크 토큰으로 센터 판별)
 *
 * 웹 신규 가입에서 '회원권 결제'를 고른 뒤의 마지막 제출. 회원은 /register 에서 이미 등록됐고
 * (memberToken 으로 그 회원만 허용), 결제창을 열기 전에 서버에서:
 *   1) 전자계약서 서명 저장(crm_signed_contracts, status=signed)
 *   2) 주문 생성(crm_orders pending, pg=memberPgProvider()) + 주문항목
 * → 결제 페이지 URL(payUrl) 반환. 결제 성공 시 기존 confirm 흐름이 상품을 발급한다.
 *
 * 금액은 클라이언트 값을 믿지 않고 signup_enabled 상품 가격을 서버에서 합산한다.
 */
export async function POST(request: Request) {
  // 🚨 공개(무인증) 경로이고 결제 전에 회원·계약서·주문을 먼저 만든다 → 반복 호출로
  //   센터 회원 목록에 가짜 회원이 쌓이지 않게 횟수를 제한한다.
  const rl = await checkRateLimit(getClientIp(request), "write");
  if (rl) return rl;

  /* 결제창을 띄울 수 있는 상태인지 — 쓰는 PG 의 키만 본다.
     포트원 키가 비어도 토스로 팔고 있으면 막을 이유가 없다. */
  const pgReady = memberPgProvider() === "toss" ? tossKeysMatch() : portoneConfigured();
  if (!onlineSalesEnabled() || !pgReady) {
    return NextResponse.json({ error: SALES_DISABLED_MESSAGE }, { status: 503 });
  }

  let body: {
    token?: string;
    /** /register 가 발급한 회원 토큰 — 방금 등록한 그 회원에게만 계약서·주문을 만든다 */
    memberToken?: string;
    membershipId?: number;
    apparelId?: number | null;
    lockerId?: number | null;
    startDate?: string | null;
    signature?: string;
    termsAccepted?: Record<string, boolean>;
    contractTemplateId?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const token = String(body.token ?? "").trim();
  if (!token) return NextResponse.json({ error: "가입 링크가 필요합니다" }, { status: 400 });

  // 1) 토큰 → 센터
  const { data: link } = await supabase
    .from("crm_center_join_links")
    .select("center_id")
    .eq("token", token)
    .maybeSingle();
  if (!link) return NextResponse.json({ error: "유효하지 않은 가입 링크예요" }, { status: 404 });
  const centerId = link.center_id as number;
  const { data: center } = await supabase
    .from("crm_centers")
    .select("id, name, status, stamp_data_url")
    .eq("id", centerId)
    .maybeSingle();
  if (!center || center.status !== "active") {
    return NextResponse.json({ error: "센터를 찾을 수 없어요" }, { status: 404 });
  }

  // 2) 회원 — /register 에서 이미 등록됨. 토큰으로 그 회원만 허용.
  const tok = verifyJoinMemberToken(body.memberToken);
  if (!tok || tok.centerId !== centerId)
    return NextResponse.json(
      { error: "가입 정보가 만료됐어요. 처음부터 다시 진행해 주세요." },
      { status: 401 }
    );
  const { data: memberRow } = await supabase
    .from("crm_members")
    .select("id, name, phone, birth, gender, address, status")
    .eq("id", tok.memberId)
    .eq("center_id", centerId)
    .maybeSingle();
  if (!memberRow || memberRow.status !== "active")
    return NextResponse.json({ error: "회원 정보를 찾을 수 없어요. 센터에 문의해 주세요." }, { status: 404 });
  const memberId = memberRow.id as number;
  const name = (memberRow.name ?? "").trim();
  const phone = normPhone(memberRow.phone ?? "");
  const birth = memberRow.birth ?? "";
  const gender = memberRow.gender ?? "";
  const address = memberRow.address ?? null;

  const sig = body.signature ?? "";
  if (!sig.startsWith("data:image"))
    return NextResponse.json({ error: "서명을 입력해 주세요" }, { status: 400 });

  // 3) 상품 로드 (signup_enabled 만) + 금액 서버 합산
  const ids = [body.membershipId, body.apparelId, body.lockerId]
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!body.membershipId)
    return NextResponse.json({ error: "헬스 이용권을 선택해 주세요" }, { status: 400 });

  const { data: prodRows } = await supabase
    .from("crm_products")
    .select("id, type, name, price_won, vat_included")
    .in("id", ids)
    .eq("center_id", centerId)
    .eq("signup_enabled", true)
    .eq("status", "active");
  const prods = (prodRows ?? []) as {
    id: number;
    type: string;
    name: string;
    price_won: number | null;
    vat_included: boolean | null;
  }[];
  // 선택 순서 유지: 회원권 → 운동복 → 락커
  const ordered = [body.membershipId, body.apparelId, body.lockerId]
    .map((id) => prods.find((p) => p.id === Number(id)))
    .filter((p): p is (typeof prods)[number] => !!p);
  if (!ordered.some((p) => p.type === "membership"))
    return NextResponse.json({ error: "이용권을 다시 선택해 주세요" }, { status: 400 });
  const amount = ordered.reduce((s, p) => s + Math.max(0, Number(p.price_won) || 0), 0);
  if (amount <= 0)
    return NextResponse.json({ error: "결제 금액이 올바르지 않아요" }, { status: 400 });

  // 시작일 — 모든 구성품에 일괄 적용. 오늘(KST) 이전 금지. 안 주면 null(발급 시 오늘).
  let startDate: string | null = null;
  if (body.startDate && String(body.startDate).trim()) {
    const s = String(body.startDate).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || s < kstToday())
      return NextResponse.json({ error: "시작일을 확인해 주세요" }, { status: 400 });
    startDate = s;
  }

  // 4) 계약서 양식 + 섹션 (센터 지정 양식만) + 필수 동의 검증
  let tplQuery = supabase
    .from("crm_contract_templates")
    .select("id, title, body, sections")
    .eq("center_id", centerId)
    .eq("status", "active")
    .eq("signup_enabled", true);
  tplQuery = body.contractTemplateId
    ? tplQuery.eq("id", body.contractTemplateId)
    : tplQuery.order("created_at", { ascending: false }).limit(1);
  const { data: tpl } = await tplQuery.maybeSingle();
  if (!tpl)
    return NextResponse.json({ error: "가입 계약서 양식이 없어요. 센터에 문의해 주세요." }, { status: 400 });

  let sections: Section[] =
    Array.isArray(tpl.sections) && tpl.sections.length > 0
      ? (tpl.sections as Section[])
      : parseSectionsFromBody(tpl.body ?? "");
  if (sections.length === 0)
    sections = [{ key: "default", title: tpl.title, body: tpl.body ?? "", required: true }];
  const accepted = body.termsAccepted ?? {};
  const requiredMissing = sections.filter((s) => s.required && !accepted[s.key]);
  if (requiredMissing.length > 0)
    return NextResponse.json({ error: "필수 약관에 모두 동의해 주세요" }, { status: 400 });

  // 5) 전자계약서 서명 저장
  const membershipProd = ordered.find((p) => p.type === "membership");
  await supabase.from("crm_signed_contracts").insert({
    center_id: centerId,
    member_id: memberId,
    title: tpl.title,
    customer_info: {
      name,
      phone,
      birth,
      gender: gender === "M" ? "남" : gender === "F" ? "여" : "",
      address: address ?? "",
    } as never,
    product_info: { plan_name: membershipProd?.name ?? "" } as never,
    payment_info: { price_won: amount } as never,
    terms_accepted: accepted as never,
    terms_snapshot: sections as never,
    signature_data_url: sig,
    // 직원이 아닌 '센터'가 계약 상대 — 직원 서명란에 센터명 + 센터 각인(도장)을 넣는다.
    // 각인이 없으면 화면에서 '계약자: 센터명' 으로 표시(center_party 플래그로 분기).
    trainer_signature_data_url:
      typeof (center as { stamp_data_url?: string | null }).stamp_data_url === "string" &&
      (center as { stamp_data_url?: string }).stamp_data_url!.startsWith("data:image")
        ? (center as { stamp_data_url?: string }).stamp_data_url
        : null,
    trainer_info: { name: center.name, center_party: true } as never,
    signed_by_uid: null,
    status: "signed",
    signed_at: new Date().toISOString(),
  } as never);

  // 6) 주문 생성 (pending, portone)
  const orderName =
    ordered.length === 1 ? ordered[0].name : `${ordered[0].name} 외 ${ordered.length - 1}건`;
  const rand = Math.random().toString(36).slice(2, 10);
  const orderUid = `js_${centerId}_${memberId}_${Date.now().toString(36)}_${rand}`;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const { data: order, error: oErr } = await supabase
    .from("crm_orders")
    .insert({
      center_id: centerId,
      member_id: memberId,
      product_id: ordered[0].id,
      product_name: orderName,
      product_type: ordered[0].type,
      list_price_won: amount,
      coupon_discount_won: 0,
      mileage_used: 0,
      mileage_earned: 0,
      amount_won: amount,
      status: "pending",
      order_uid: orderUid,
      pg_provider: memberPgProvider(),
      channel: "web",
      expires_at: expiresAt,
      start_date: startDate,
    } as never)
    .select("id")
    .single();
  if (oErr || !order)
    return NextResponse.json({ error: "주문 생성 실패", detail: errLogOnly(oErr) }, { status: 500 });
  const orderId = (order as { id: number }).id;

  const { error: itemErr } = await supabase.from("crm_order_items").insert(
    ordered.map((p) => ({
      order_id: orderId,
      center_id: centerId,
      member_id: memberId,
      product_id: p.id,
      product_name: p.name,
      product_type: p.type,
      list_price_won: Math.max(0, Number(p.price_won) || 0),
      coupon_discount_won: 0,
      mileage_used: 0,
      mileage_earned: 0,
      amount_won: Math.max(0, Number(p.price_won) || 0),
    })) as never
  );
  if (itemErr) {
    await supabase.from("crm_orders").delete().eq("id", orderId);
    return NextResponse.json({ error: "주문 생성 실패", detail: errLogOnly(itemErr) }, { status: 500 });
  }

  const payToken = signOrderToken(orderUid);
  // 결제 성공 후 가입 완료(앱 설치) 화면으로 — 출석번호(휴대폰 뒤 4자리)도 함께 전달
  const last4 = phone.replace(/\D/g, "").slice(-4);
  const returnTo = `/join/${encodeURIComponent(token)}/signup/done?no=${last4}&paid=1`;
  return NextResponse.json({
    ok: true,
    orderUid,
    amount,
    payUrl: `${payPath(await payPathSlugForCenter(centerId), orderUid)}?t=${payToken}&returnTo=${encodeURIComponent(returnTo)}`,
  });
}
