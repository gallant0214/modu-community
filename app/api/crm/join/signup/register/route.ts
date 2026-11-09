import { errLogOnly } from "@/app/lib/api-error";
import { NextResponse, after } from "next/server";
import { getClientIp, checkRateLimit } from "@/app/lib/security";
import { supabase } from "@/app/lib/supabase";
import { signJoinMemberToken, verifyJoinMemberToken } from "@/app/lib/order-token";
import { notifyCenterStaffSignupPurchase } from "@/app/lib/crm-staff-notify";

export const dynamic = "force-dynamic";

const normPhone = (v: string) => {
  const d = (v || "").replace(/\D/g, "").slice(0, 11);
  if (d.length < 8) return d;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
};
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

/** 이 회원이 이미 발급받은 상품(회원권/수강권/대여권)이 있는지 — 완료된 가입 판별 */
async function memberHasProducts(memberId: number, centerId: number): Promise<boolean> {
  for (const table of ["crm_memberships", "crm_passes", "crm_rentals"] as const) {
    const { data } = await supabase
      .from(table)
      .select("id")
      .eq("center_id", centerId)
      .eq("member_id", memberId)
      .limit(1)
      .maybeSingle();
    if (data) return true;
  }
  return false;
}

/**
 * POST /api/crm/join/signup/register  (공개·무인증 — QR 가입 링크 토큰으로 센터 판별)
 *
 * 웹 신규 가입 1단계: 회원 정보 + 본인확인 사진을 받아 **결제와 무관하게** 바로 CRM 회원으로 등록.
 * 이후 회원이 '회원권 결제'를 고르면 /submit 이 memberToken 으로 이 회원에게 계약서·주문을 만든다.
 *
 * memberToken 이 오면(등록 후 '이전'으로 돌아가 정보를 고친 경우) 그 회원을 수정한다 — 새로 만들지 않음.
 *   단, 이미 앱 연동·결제(상품 발급)까지 끝난 회원은 웹에서 못 고친다(센터 문의).
 *
 * 같은 센터에 이름+전화번호가 같은 (다른) 회원이 있으면:
 *   · 앱 연동됨 / 정식회원(member_type≠provisional) / 발급 상품 보유 → 가입 차단(기존 회원 연동 안내)
 *   · 상품 없는 provisional(이전에 웹 가입만 하고 떠난 경우) → 그 레코드를 재사용(중복 생성 방지)
 */
export async function POST(request: Request) {
  // 🚨 공개(무인증) 경로에서 회원을 만든다 → 반복 호출로 가짜 회원이 쌓이지 않게 횟수 제한.
  const rl = await checkRateLimit(getClientIp(request), "write");
  if (rl) return rl;

  let body: {
    token?: string;
    name?: string;
    phone?: string;
    birth?: string;
    gender?: "male" | "female" | string;
    address?: string;
    faceImage?: string;
    faceThumb?: string;
    privacyConsent?: boolean;
    /** 이미 등록한 뒤 '이전'으로 돌아가 정보를 고친 경우 — 그 회원을 수정(새로 만들지 않음) */
    memberToken?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const token = String(body.token ?? "").trim();
  if (!token) return NextResponse.json({ error: "가입 링크가 필요합니다" }, { status: 400 });

  const { data: link } = await supabase
    .from("crm_center_join_links")
    .select("center_id")
    .eq("token", token)
    .maybeSingle();
  if (!link) return NextResponse.json({ error: "유효하지 않은 가입 링크예요" }, { status: 404 });
  const centerId = link.center_id as number;
  const { data: center } = await supabase
    .from("crm_centers")
    .select("id, status")
    .eq("id", centerId)
    .maybeSingle();
  if (!center || center.status !== "active") {
    return NextResponse.json({ error: "센터를 찾을 수 없어요" }, { status: 404 });
  }

  const name = (body.name ?? "").trim();
  const phone = normPhone(body.phone ?? "");
  const birth = (body.birth ?? "").trim();
  const gender = body.gender === "male" ? "M" : body.gender === "female" ? "F" : "";
  const address = (body.address ?? "").trim().slice(0, 120) || null;
  if (body.privacyConsent !== true)
    return NextResponse.json({ error: "개인정보 수집·이용에 동의해 주세요" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "이름을 입력해 주세요" }, { status: 400 });
  if (phone.replace(/\D/g, "").length < 10)
    return NextResponse.json({ error: "연락처를 확인해 주세요" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth))
    return NextResponse.json({ error: "생년월일을 확인해 주세요" }, { status: 400 });
  if (!gender) return NextResponse.json({ error: "성별을 선택해 주세요" }, { status: 400 });

  const face = body.faceImage ?? "";
  if (!face.startsWith("data:image") || face.length > 400_000)
    return NextResponse.json({ error: "본인확인 사진을 다시 촬영해 주세요" }, { status: 400 });

  // 정보 수정 대상(방금 이 화면에서 등록한 회원). 토큰이 만료·위조면 무시하고 일반 등록으로 처리
  //  — 이름·번호를 그대로 두었다면 아래 '상품 없는 provisional 재사용' 으로 같은 회원에 붙는다.
  const editTok = verifyJoinMemberToken(body.memberToken);
  const editId = editTok && editTok.centerId === centerId ? editTok.memberId : null;

  // 기존 등록 회원 차단 + 재사용 판별 (수정 중인 본인 레코드는 제외)
  const phoneDigits = phone.replace(/\D/g, "");
  const { data: cands } = await supabase
    .from("crm_members")
    .select("id, name, phone, member_type, linked_firebase_uid")
    .eq("center_id", centerId)
    .eq("status", "active")
    .ilike("phone", `%${phoneDigits.slice(-4)}%`);
  const matches = (cands ?? []).filter(
    (m) =>
      m.id !== editId &&
      (m.phone ?? "").replace(/\D/g, "") === phoneDigits &&
      (m.name ?? "").trim().toLowerCase() === name.toLowerCase()
  );
  let blocked = matches.some((m) => m.linked_firebase_uid || m.member_type !== "provisional");
  let reuseId: number | null = null;
  if (!blocked) {
    for (const m of matches) {
      if (await memberHasProducts(m.id as number, centerId)) {
        blocked = true;
        break;
      }
      reuseId = m.id as number;
    }
  }
  if (blocked) {
    return NextResponse.json(
      {
        ok: false,
        reason: "already_member",
        error: "이미 등록된 회원입니다. 회원용 앱의 '기존 회원 연동' 기능을 이용해 주세요.",
      },
      { status: 409 }
    );
  }

  const nowIso = new Date().toISOString();
  let memberId: number;
  if (editId) {
    // 등록 후 '이전'으로 돌아가 고친 정보 반영 — 같은 회원 레코드를 수정
    const { data: me } = await supabase
      .from("crm_members")
      .select("id, status, member_type, linked_firebase_uid")
      .eq("id", editId)
      .eq("center_id", centerId)
      .maybeSingle();
    if (!me || me.status !== "active")
      return NextResponse.json({ error: "회원 정보를 찾을 수 없어요. 센터에 문의해 주세요." }, { status: 404 });
    if (me.linked_firebase_uid || me.member_type !== "provisional" || (await memberHasProducts(editId, centerId)))
      return NextResponse.json(
        { error: "이미 가입이 완료되어 여기서는 정보를 바꿀 수 없어요. 센터에 문의해 주세요." },
        { status: 409 }
      );
    memberId = editId;
    const { error: eErr } = await supabase
      .from("crm_members")
      .update({
        name,
        phone,
        birth,
        gender,
        address,
        attendance_no: phoneDigits.slice(-4),
        privacy_agreed_at: nowIso,
        face_image_data: face,
        face_image_thumb: body.faceThumb || face,
        face_consent_at: nowIso,
      } as never)
      .eq("id", memberId);
    if (eErr) return NextResponse.json({ error: "회원 정보 수정 실패", detail: errLogOnly(eErr) }, { status: 500 });
  } else if (reuseId) {
    memberId = reuseId;
    const { error: uErr } = await supabase
      .from("crm_members")
      .update({
        name,
        birth,
        gender,
        ...(address ? { address } : {}),
        privacy_agreed_at: nowIso,
        face_image_data: face,
        face_image_thumb: body.faceThumb || face,
        face_consent_at: nowIso,
      } as never)
      .eq("id", memberId);
    if (uErr) return NextResponse.json({ error: "회원 등록 실패", detail: errLogOnly(uErr) }, { status: 500 });
  } else {
    const { data: created, error: mErr } = await supabase
      .from("crm_members")
      .insert({
        center_id: centerId,
        member_type: "provisional", // 앱 연동 전 상태. 앱에서 이름+전화번호로 연동 시 matched 로 전환
        name,
        phone,
        birth,
        gender,
        address,
        status: "active",
        registration_type: "신규",
        registered_at: kstToday(),
        attendance_no: phoneDigits.slice(-4),
        privacy_agreed_at: nowIso,
        face_image_data: face,
        face_image_thumb: body.faceThumb || face,
        face_consent_at: nowIso,
      } as never)
      .select("id")
      .single();
    if (mErr || !created)
      return NextResponse.json({ error: "회원 등록 실패", detail: errLogOnly(mErr) }, { status: 500 });
    memberId = (created as { id: number }).id;
    // 가입 및 등록 알림 — 권한 있는 직원에게 신규가입 알림
    after(() => notifyCenterStaffSignupPurchase({ centerId, kind: "signup", memberId, memberName: name }));
  }

  return NextResponse.json({
    ok: true,
    memberToken: signJoinMemberToken(centerId, memberId),
    attendanceNo: phoneDigits.slice(-4),
  });
}
