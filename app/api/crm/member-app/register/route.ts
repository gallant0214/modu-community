import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { digitsOnly } from "@/app/lib/crm-identity";

export const dynamic = "force-dynamic";

function hyphenPhone(digits: string): string {
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return digits;
}

/**
 * POST /api/crm/member-app/register
 * 회원 앱 셀프 회원가입 — 센터를 검색·선택해 신규 회원으로 가입.
 *
 * body: { centerId, name, birth?(YYYY-MM-DD), phone, address?, privacyConsent }
 *
 * - privacyConsent=true 필수 (개인정보 수집·이용 동의). privacy_agreed_at 기록.
 * - 이미 그 센터에 내 계정으로 연동된 회원이 있으면 그대로 반환(멱등).
 * - 같은 센터에 동일 이름+전화의 미연동 회원(직원이 미리 등록한 가회원)이 있으면 그 레코드를 연결.
 * - 없으면 신규 crm_members 생성(member_type='matched', linked_firebase_uid=uid).
 */
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  let body: {
    centerId?: number;
    name?: string;
    birth?: string;
    phone?: string;
    address?: string;
    privacyConsent?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const centerId = Number(body.centerId);
  const name = (body.name ?? "").trim();
  const phoneDigits = digitsOnly(body.phone);
  const birth = typeof body.birth === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.birth) ? body.birth : null;
  const address = (body.address ?? "").trim() || null;

  if (!centerId) return NextResponse.json({ error: "센터를 선택해주세요" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "이름을 입력해주세요" }, { status: 400 });
  if (!birth) return NextResponse.json({ error: "생년월일을 정확히 입력해주세요" }, { status: 400 });
  if (phoneDigits.length < 10) return NextResponse.json({ error: "연락처를 정확히 입력해주세요" }, { status: 400 });
  if (body.privacyConsent !== true) {
    return NextResponse.json({ error: "개인정보 수집·이용 동의가 필요해요" }, { status: 400 });
  }

  // 센터 유효성
  const { data: center } = await supabase
    .from("crm_centers")
    .select("id, status")
    .eq("id", centerId)
    .maybeSingle();
  if (!center || center.status !== "active") {
    return NextResponse.json({ error: "가입할 수 없는 센터예요" }, { status: 404 });
  }

  const nowIso = new Date().toISOString();

  // 1) 이미 이 센터에 내 계정으로 연동된 회원?
  const { data: mine } = await supabase
    .from("crm_members")
    .select("id")
    .eq("center_id", centerId)
    .eq("linked_firebase_uid", user.uid)
    .eq("status", "active")
    .maybeSingle();
  if (mine) return NextResponse.json({ ok: true, memberId: mine.id, alreadyMember: true });

  // 2) 같은 센터의 동일 이름+전화 미연동 회원이 있으면 연결
  const last4 = phoneDigits.slice(-4);
  const { data: candidates } = await supabase
    .from("crm_members")
    .select("id, name, phone, linked_firebase_uid, birth, address, attendance_no")
    .eq("center_id", centerId)
    .eq("status", "active")
    .ilike("phone", `%${last4}%`);
  const match = (candidates ?? []).find(
    (m) =>
      !m.linked_firebase_uid &&
      digitsOnly(m.phone) === phoneDigits &&
      m.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (match) {
    const linkPatch: Record<string, unknown> = {
      linked_firebase_uid: user.uid,
      member_type: "matched",
      birth: match.birth ?? birth,
      address: match.address ?? address,
      privacy_agreed_at: nowIso,
    };
    // 기존 미연동 회원의 attendance_no 가 비어 있으면 폰 뒷자리 4자리로 채워둔다.
    if (!match.attendance_no || !match.attendance_no.trim()) {
      linkPatch.attendance_no = last4;
    }
    const { error: linkErr } = await supabase
      .from("crm_members")
      .update(linkPatch as never)
      .eq("id", match.id)
      .is("linked_firebase_uid", null);
    if (linkErr) return NextResponse.json({ error: "가입 실패", detail: linkErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, memberId: match.id, linkedExisting: true });
  }

  // 3) 신규 생성 (attendance_no = 폰 뒷 4자리; 중복은 터치출석 시 이름/전화로 선택)
  const { data: created, error } = await supabase
    .from("crm_members")
    .insert({
      center_id: centerId,
      member_type: "matched",
      name,
      phone: hyphenPhone(phoneDigits),
      birth,
      address,
      linked_firebase_uid: user.uid,
      privacy_agreed_at: nowIso,
      status: "active",
      attendance_no: last4,
    } as never)
    .select("id")
    .single();
  if (error || !created) {
    return NextResponse.json({ error: "가입 실패", detail: error?.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, memberId: created.id, created: true });
}
