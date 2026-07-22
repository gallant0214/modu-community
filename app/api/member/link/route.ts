import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { digitsOnly } from "@/app/lib/crm-identity";

export const dynamic = "force-dynamic";

/**
 * POST /api/member/link
 * 회원 앱 계정 연동 — 구글/애플 로그인한 Firebase 사용자를 crm_members 와 연결.
 *
 * body: { name, phone }
 *
 * 이름 + 전화번호(숫자만)가 일치하는, 아직 연동 안 된 회원 레코드를 찾아
 * linked_firebase_uid 를 채운다. 여러 센터에 등록돼 있으면 모두 연결.
 *
 * 보안: 전화번호만으로는 사칭 위험이 있어 이름까지 함께 확인한다.
 * 추후 초대 링크(딥링크) 기반 자동 연동으로 대체 예정.
 */
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  let body: { name?: string; phone?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const phoneDigits = digitsOnly(body.phone);
  if (!name || phoneDigits.length < 9) {
    return NextResponse.json({ error: "이름과 연락처를 정확히 입력해주세요" }, { status: 400 });
  }

  // 이미 이 uid 로 연동된 회원이 있으면 그대로 성공 처리(멱등)
  const { data: already } = await supabase
    .from("crm_members")
    .select("id")
    .eq("linked_firebase_uid", user.uid)
    .eq("status", "active")
    .limit(1);
  if (already && already.length > 0) {
    return NextResponse.json({ ok: true, alreadyLinked: true, linked: already.length });
  }

  // 전화번호 뒤 4자리로 후보를 좁힌 뒤 숫자 정규화 + 이름으로 정밀 매칭
  const last4 = phoneDigits.slice(-4);
  const { data: candidates, error } = await supabase
    .from("crm_members")
    .select("id, name, phone, member_type, linked_firebase_uid, status")
    .eq("status", "active")
    .ilike("phone", `%${last4}%`);

  if (error) {
    return NextResponse.json({ error: "DB 오류", detail: error.message }, { status: 500 });
  }

  const matches = (candidates ?? []).filter(
    (m) =>
      digitsOnly(m.phone) === phoneDigits &&
      m.name.trim().toLowerCase() === name.toLowerCase()
  );

  if (matches.length === 0) {
    return NextResponse.json(
      { error: "일치하는 회원 정보를 찾지 못했어요. 센터에 등록된 이름·연락처인지 확인해주세요." },
      { status: 404 }
    );
  }

  // 이미 다른 사람(uid)에게 연동된 레코드는 제외
  const linkable = matches.filter(
    (m) => !m.linked_firebase_uid || m.linked_firebase_uid === user.uid
  );
  if (linkable.length === 0) {
    return NextResponse.json(
      { error: "이미 다른 계정에 연동된 회원 정보예요. 센터에 문의해주세요." },
      { status: 409 }
    );
  }

  const ids = linkable.map((m) => m.id);
  const { error: updErr } = await supabase
    .from("crm_members")
    .update({
      linked_firebase_uid: user.uid,
      // provisional(가회원) → matched(매칭회원) 승격
      member_type: "matched",
    })
    .in("id", ids)
    .is("linked_firebase_uid", null); // 경합 방지: 아직 미연동인 것만

  if (updErr) {
    return NextResponse.json({ error: "연동 실패", detail: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, linked: ids.length });
}
