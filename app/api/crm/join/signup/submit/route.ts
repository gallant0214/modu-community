import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { onlineSalesEnabled, SALES_DISABLED_MESSAGE } from "@/app/lib/member-checkout";
import { portoneConfigured } from "@/app/lib/portone-payments";
import { signOrderToken } from "@/app/lib/order-token";

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
 * 웹 신규 회원 가입의 마지막 제출. 결제창을 열기 전에 서버에서:
 *   1) 회원 생성(없으면) + 본인확인 얼굴 저장
 *   2) 전자계약서 서명 저장(crm_signed_contracts, status=signed)
 *   3) 주문 생성(crm_orders pending, pg=portone) + 주문항목
 * → 결제 페이지 URL(payUrl) 반환. 결제 성공 시 기존 confirm 흐름이 상품을 발급한다.
 *
 * 금액은 클라이언트 값을 믿지 않고 signup_enabled 상품 가격을 서버에서 합산한다.
 */
export async function POST(request: Request) {
  if (!onlineSalesEnabled() || !portoneConfigured()) {
    return NextResponse.json({ error: SALES_DISABLED_MESSAGE }, { status: 503 });
  }

  let body: {
    token?: string;
    name?: string;
    phone?: string;
    birth?: string;
    gender?: "male" | "female" | string;
    membershipId?: number;
    apparelId?: number | null;
    lockerId?: number | null;
    faceImage?: string;
    faceThumb?: string;
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
    .select("id, name, status")
    .eq("id", centerId)
    .maybeSingle();
  if (!center || center.status !== "active") {
    return NextResponse.json({ error: "센터를 찾을 수 없어요" }, { status: 404 });
  }

  // 2) 입력 검증
  const name = (body.name ?? "").trim();
  const phone = normPhone(body.phone ?? "");
  const birth = (body.birth ?? "").trim();
  const gender = body.gender === "male" ? "M" : body.gender === "female" ? "F" : "";
  if (!name) return NextResponse.json({ error: "이름을 입력해 주세요" }, { status: 400 });
  if (phone.replace(/\D/g, "").length < 10)
    return NextResponse.json({ error: "연락처를 확인해 주세요" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth))
    return NextResponse.json({ error: "생년월일을 확인해 주세요" }, { status: 400 });
  if (!gender) return NextResponse.json({ error: "성별을 선택해 주세요" }, { status: 400 });

  const face = body.faceImage ?? "";
  if (!face.startsWith("data:image") || face.length > 400_000)
    return NextResponse.json({ error: "본인확인 사진을 다시 촬영해 주세요" }, { status: 400 });
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

  // 5) 회원 생성/재사용 (center_id + phone 로 중복 방지 — 결제 재시도 안전)
  let memberId: number;
  const { data: existing } = await supabase
    .from("crm_members")
    .select("id")
    .eq("center_id", centerId)
    .eq("phone", phone)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (existing) {
    memberId = existing.id as number;
    await supabase
      .from("crm_members")
      .update({
        name,
        birth,
        gender,
        face_image_data: face,
        face_image_thumb: body.faceThumb || face,
        face_consent_at: new Date().toISOString(),
      } as never)
      .eq("id", memberId);
  } else {
    const { data: created, error: mErr } = await supabase
      .from("crm_members")
      .insert({
        center_id: centerId,
        member_type: "provisional", // 앱 연동 전 상태. 앱에서 센터명+전화번호로 연동 시 matched 로 전환
        name,
        phone,
        birth,
        gender,
        status: "active",
        registration_type: "신규",
        registered_at: kstToday(),
        attendance_no: phone.replace(/\D/g, "").slice(-4),
        privacy_agreed_at: new Date().toISOString(),
        face_image_data: face,
        face_image_thumb: body.faceThumb || face,
        face_consent_at: new Date().toISOString(),
      } as never)
      .select("id")
      .single();
    if (mErr || !created)
      return NextResponse.json({ error: "회원 생성 실패", detail: mErr?.message }, { status: 500 });
    memberId = (created as { id: number }).id;
  }

  // 6) 전자계약서 서명 저장
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
    } as never,
    product_info: { plan_name: membershipProd?.name ?? "" } as never,
    payment_info: { price_won: amount } as never,
    terms_accepted: accepted as never,
    terms_snapshot: sections as never,
    signature_data_url: sig,
    signed_by_uid: null,
    status: "signed",
    signed_at: new Date().toISOString(),
  } as never);

  // 7) 주문 생성 (pending, portone)
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
      pg_provider: "portone",
      channel: "web",
      expires_at: expiresAt,
      start_date: null,
    } as never)
    .select("id")
    .single();
  if (oErr || !order)
    return NextResponse.json({ error: "주문 생성 실패", detail: oErr?.message }, { status: 500 });
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
    return NextResponse.json({ error: "주문 생성 실패", detail: itemErr.message }, { status: 500 });
  }

  const payToken = signOrderToken(orderUid);
  // 결제 성공 후 가입 완료(앱 설치) 화면으로 되돌아오도록 returnTo 를 붙인다
  const returnTo = `/join/${encodeURIComponent(token)}/signup/done`;
  return NextResponse.json({
    ok: true,
    orderUid,
    amount,
    payUrl: `/pay/${orderUid}?t=${payToken}&returnTo=${encodeURIComponent(returnTo)}`,
  });
}
