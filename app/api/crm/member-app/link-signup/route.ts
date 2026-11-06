import { NextResponse } from "next/server";
import { getClientIp, checkRateLimit } from "@/app/lib/security";
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
 *   - name 필수 — 전화번호와 이름이 둘 다 맞아야 연결(🚨 번호만으로 연결되던 구멍 차단)
 *
 * 응답: { ok:true, memberId, centerId, centerName } |
 *       { ok:false, reason:"not_found"|"multiple"|"invalid" }
 */
export async function POST(request: Request) {
  // 🚨 이름·전화번호 대입을 막는다 — /api/crm/member-app/link 와 같은 제한
  const rl = await checkRateLimit(getClientIp(request), "auth");
  if (rl) return rl;

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
  // 🚨 이름은 필수다. 예전엔 같은 번호가 여럿일 때만 이름을 봐서, 로그인만 하면
  //   센터번호 + 전화번호만으로 남의 회원 기록을 내 앱 계정에 연결할 수 있었다
  //   (연동되면 이용권·예약·계약서·체성분 기록·마일리지까지 보인다).
  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ ok: false, reason: "invalid", error: "이름을 입력해 주세요" }, { status: 400 });
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
  // 번호와 이름이 **둘 다** 맞는 미연동 회원만
  const unlinked = (cand ?? []).filter(
    (m) =>
      !m.linked_firebase_uid &&
      digitsOnly(m.phone) === phoneDigits &&
      m.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (unlinked.length === 0) {
    // 번호만 맞는지·이름만 맞는지는 알려주지 않는다(회원 존재 여부 탐색 방지)
    return NextResponse.json(
      { ok: false, reason: "not_found", error: "해당 센터에 이름과 전화번호가 일치하는 회원이 없어요" },
      { status: 404 }
    );
  }
  if (unlinked.length > 1) {
    // 이름·번호까지 같은 미연동 회원이 둘 이상 — 자동으로 고르지 않고 센터 확인을 받게 한다
    return NextResponse.json({ ok: false, reason: "multiple", error: "같은 이름·번호의 회원이 여러 명이에요. 센터에 문의해 주세요" }, { status: 409 });
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
