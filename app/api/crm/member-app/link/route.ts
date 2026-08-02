import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { digitsOnly } from "@/app/lib/crm-identity";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/member-app/link  { name, phone }
 * 로그인한 Firebase 사용자를 crm_members 와 연결(이름+전화번호 매칭).
 * 여러 센터에 등록돼 있으면 모두 연결. 이미 다른 계정에 연동된 레코드는 제외.
 */
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

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

  // 이미 연동돼 있으면 멱등 성공
  const { data: already } = await supabase
    .from("crm_members")
    .select("id")
    .eq("linked_firebase_uid", user.uid)
    .eq("status", "active")
    .limit(1);
  if (already && already.length > 0) {
    return NextResponse.json({ ok: true, alreadyLinked: true, linked: already.length });
  }

  const last4 = phoneDigits.slice(-4);
  const { data: candidates } = await supabase
    .from("crm_members")
    .select("id, name, phone, linked_firebase_uid, status")
    .eq("status", "active")
    .ilike("phone", `%${last4}%`);

  const matches = (candidates ?? []).filter(
    (m) => digitsOnly(m.phone) === phoneDigits && m.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (matches.length === 0) {
    return NextResponse.json(
      { error: "일치하는 회원 정보를 찾지 못했어요. 센터에 등록된 이름·연락처인지 확인해주세요." },
      { status: 404 }
    );
  }

  const linkable = matches.filter((m) => !m.linked_firebase_uid || m.linked_firebase_uid === user.uid);
  if (linkable.length === 0) {
    return NextResponse.json(
      { error: "이미 다른 계정에 연동된 회원 정보예요. 센터에 문의해주세요." },
      { status: 409 }
    );
  }

  const ids = linkable.map((m) => m.id);
  const { error: updErr } = await supabase
    .from("crm_members")
    .update({ linked_firebase_uid: user.uid, member_type: "matched" } as never)
    .in("id", ids)
    .is("linked_firebase_uid", null);
  if (updErr) {
    return NextResponse.json({ error: "연동 실패", detail: updErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, linked: ids.length });
}
