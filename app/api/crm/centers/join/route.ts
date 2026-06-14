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

  let body: { centerId?: number };
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

  // 표시명 — 본인 닉네임
  const { data: nick } = await supabase
    .from("nicknames")
    .select("name")
    .eq("firebase_uid", user.uid)
    .maybeSingle();
  const displayName = nick?.name || user.email?.split("@")[0] || "사용자";

  // trainer 멤버십 생성
  const { data: member, error: memberErr } = await supabase
    .from("crm_center_members")
    .insert({
      center_id: center.id,
      firebase_uid: user.uid,
      role: "trainer",
      display_name: displayName,
      email: user.email ?? null,
      access_level: "none",          // 🚨 사장님이 권한 올리기 전까지 데이터 접근 0
      is_solo_owner: false,
      status: "active",
    })
    .select("id")
    .single();

  if (memberErr || !member) {
    return NextResponse.json(
      { error: "가입 실패", detail: memberErr?.message },
      { status: 500 }
    );
  }

  // PDF 2-3 기본 권한 — 모두 true 디폴트. 사장님이 직원관리에서 끌 수 있음.
  await supabase.from("crm_trainer_permissions").insert({
    center_member_id: member.id,
    can_create_reservation: true,
    can_modify_reservation: true,
    can_cancel_reservation: true,
    attendance_mode: "trainer",
    can_cancel_attendance: true,
    can_issue_pass: true,
  });

  return NextResponse.json({
    onboarded: true,
    centerId: center.id,
    centerName: center.name,
    centerKind: "center" as const,
    role: "trainer" as const,
    accessLevel: "none" as const,
    isSoloOwner: false,
  });
}
