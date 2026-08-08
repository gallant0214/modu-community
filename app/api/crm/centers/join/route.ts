import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { loadCrmContextForUid } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/centers/join
 * body: { centerId: number }
 *
 * 일반 강사가 사장님이 만든 센터에 trainer 로 가입.
 *
 * 정책 ([[feedback-crm-data-isolation]]):
 *  - role = 'trainer'
 *  - access_level = 'none'  → 가입 직후엔 데이터 접근 0. 사장님이 직원관리에서 권한 올려야 진짜 접근 가능.
 *  - is_solo_owner = false
 *  - status = 'active' (즉시 가입, 사장님은 직원관리에서 inactive 로 내보낼 수 있음)
 *
 * 멱등성: 이미 멤버십 있으면 그 컨텍스트 그대로 반환.
 * 본인이 owner_uid 인 센터엔 이 API 로 가입할 필요 없음 (이미 bootstrap 으로 처리).
 */
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  // 이미 어딘가에 가입돼 있으면 그대로 반환
  const existing = await loadCrmContextForUid(user.uid);
  if (existing) {
    return NextResponse.json({
      onboarded: true,
      centerId: existing.centerId,
      centerName: existing.centerName,
      centerKind: existing.centerKind,
      role: existing.role,
      accessLevel: existing.accessLevel,
      isSoloOwner: existing.isSoloOwner,
    });
  }

  let body: { centerId?: number; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const centerId = Number(body.centerId);
  if (!centerId || Number.isNaN(centerId)) {
    return NextResponse.json({ error: "센터를 선택해주세요" }, { status: 400 });
  }

  // 대상 센터 검증: kind='center' 인 active 센터여야 함
  const { data: center, error: centerErr } = await supabase
    .from("crm_centers")
    .select("id, name, kind, status")
    .eq("id", centerId)
    .maybeSingle();

  if (centerErr) {
    return NextResponse.json({ error: "DB 오류", detail: centerErr.message }, { status: 500 });
  }
  if (!center || center.kind !== "center" || center.status !== "active") {
    return NextResponse.json({ error: "가입할 수 없는 센터입니다" }, { status: 404 });
  }

  // 표시명 — 온보딩에서 입력한 실명(body.name). 센터장이 실명으로 강사 등록을 수락하도록.
  const { data: nick } = await supabase
    .from("nicknames")
    .select("name")
    .eq("firebase_uid", user.uid)
    .maybeSingle();
  const displayName = body.name?.trim() || nick?.name || user.email?.split("@")[0] || "사용자";

  // status='pending' 으로 가입 요청 생성 → 센터장이 직원관리에서 수락해야 active.
  // 이미 이 센터에 row 가 있으면(거절/퇴사 포함) 재사용해서 다시 pending 으로.
  const nowIso = new Date().toISOString();
  const { data: existingRow } = await supabase
    .from("crm_center_members")
    .select("id, status")
    .eq("center_id", center.id)
    .eq("firebase_uid", user.uid)
    .maybeSingle();

  if (existingRow) {
    if (existingRow.status === "pending") {
      // 이미 요청함 — 멱등 응답
      return NextResponse.json({ pending: true, centerId: center.id, centerName: center.name });
    }
    const { error: reErr } = await supabase
      .from("crm_center_members")
      .update({
        status: "pending",
        role: "trainer",
        access_level: "none",
        requested_at: nowIso,
        display_name: displayName,
        email: user.email ?? null,
      } as never)
      .eq("id", existingRow.id);
    if (reErr) {
      return NextResponse.json({ error: "요청 실패", detail: reErr.message }, { status: 500 });
    }
    return NextResponse.json({ pending: true, centerId: center.id, centerName: center.name });
  }

  const { error: memberErr } = await supabase
    .from("crm_center_members")
    .insert({
      center_id: center.id,
      firebase_uid: user.uid,
      role: "trainer",
      display_name: displayName,
      email: user.email ?? null,
      access_level: "none",
      is_solo_owner: false,
      status: "pending",        // 🚨 승인 대기. 수락 전까지 CRM 컨텍스트에 안 잡힘.
      requested_at: nowIso,
    } as never);

  if (memberErr) {
    return NextResponse.json(
      { error: "요청 실패", detail: memberErr.message },
      { status: 500 }
    );
  }

  // 강사 권한 row 는 승인 시점(staff/requests approve)에 생성한다.
  return NextResponse.json({ pending: true, centerId: center.id, centerName: center.name });
}
