import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { digitsOnly } from "@/app/lib/crm-identity";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/member-app/link-signup  (회원용 앱 호출 — firebase 인증 필요)
 *
 * 웹(QR)에서 가입·결제까지 마친 신규 회원(member_type='provisional', 미연동)을
 * 앱 계정에 연결한다. 키 = 센터 + 전화번호.
 *
 * body: { centerId? , centerToken? , phone , name? }
 *   - centerId 또는 centerToken(QR 가입링크 토큰) 중 하나로 센터 특정
 *   - name 은 같은 번호의 미연동 회원이 여러 명일 때만 사용(동명이인 방지)
 *
 * 응답: { ok:true, memberId, centerId, centerName } |
 *       { ok:false, reason:"not_found"|"multiple"|"invalid" }
 */
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  let body: { centerId?: number; centerToken?: string; phone?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const phoneDigits = digitsOnly(body.phone);
  if (phoneDigits.length < 10) {
    return NextResponse.json({ ok: false, reason: "invalid", error: "전화번호를 정확히 입력해 주세요" }, { status: 400 });
  }

  // 센터 특정 — token 우선
  let centerId = Number(body.centerId) || 0;
  if (!centerId && body.centerToken) {
    const { data: link } = await supabase
      .from("crm_center_join_links")
      .select("center_id")
      .eq("token", String(body.centerToken).trim())
      .maybeSingle();
    centerId = (link?.center_id as number) || 0;
  }
  if (!centerId) {
    return NextResponse.json({ ok: false, reason: "invalid", error: "센터를 선택해 주세요" }, { status: 400 });
  }
  const { data: center } = await supabase
    .from("crm_centers")
    .select("id, name, status")
    .eq("id", centerId)
    .maybeSingle();
  if (!center || center.status !== "active") {
    return NextResponse.json({ ok: false, reason: "not_found", error: "센터를 찾을 수 없어요" }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const last4 = phoneDigits.slice(-4);

  // 이미 이 센터에 내 계정으로 연동된 회원이면 그대로 반환(멱등)
  const { data: mine } = await supabase
    .from("crm_members")
    .select("id")
    .eq("center_id", centerId)
    .eq("linked_firebase_uid", user.uid)
    .eq("status", "active")
    .maybeSingle();
  if (mine) {
    return NextResponse.json({ ok: true, memberId: mine.id, centerId, centerName: center.name, alreadyMember: true });
  }

  // 같은 센터 · 같은 번호의 미연동 회원 조회
  const { data: cand } = await supabase
    .from("crm_members")
    .select("id, name, phone, linked_firebase_uid, email, attendance_no")
    .eq("center_id", centerId)
    .eq("status", "active")
    .ilike("phone", `%${last4}%`);
  let unlinked = (cand ?? []).filter(
    (m) => !m.linked_firebase_uid && digitsOnly(m.phone) === phoneDigits
  );

  // 동일 번호 미연동 회원이 여럿이면 이름으로 좁힌다
  const name = (body.name ?? "").trim();
  if (unlinked.length > 1 && name) {
    unlinked = unlinked.filter((m) => m.name.trim().toLowerCase() === name.toLowerCase());
  }
  if (unlinked.length === 0) {
    return NextResponse.json({ ok: false, reason: "not_found", error: "해당 센터에 이 번호로 가입된 회원이 없어요" }, { status: 404 });
  }
  if (unlinked.length > 1) {
    return NextResponse.json({ ok: false, reason: "multiple", error: "같은 번호의 회원이 여러 명이에요. 이름을 함께 입력해 주세요" }, { status: 409 });
  }

  const target = unlinked[0];
  const patch: Record<string, unknown> = {
    linked_firebase_uid: user.uid,
    member_type: "matched",
    privacy_agreed_at: nowIso,
    ...(user.email && !target.email ? { email: user.email } : {}),
    ...(!target.attendance_no || !target.attendance_no.trim() ? { attendance_no: last4 } : {}),
  };
  const { error: linkErr } = await supabase
    .from("crm_members")
    .update(patch as never)
    .eq("id", target.id)
    .is("linked_firebase_uid", null); // 경합 방지 — 아직 미연동일 때만
  if (linkErr) {
    return NextResponse.json({ ok: false, reason: "invalid", error: "연동 실패", detail: linkErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, memberId: target.id, centerId, centerName: center.name, linked: true });
}
