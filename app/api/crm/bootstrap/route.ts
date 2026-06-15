import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { loadCrmContextForUid } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/bootstrap
 * 현재 로그인 사용자의 CRM 컨텍스트(센터/role/access_level) 반환.
 * 미가입이면 { onboarded: false } 응답 → 클라이언트가 onboarding 페이지로 이동.
 */
export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const ctx = await loadCrmContextForUid(user.uid);
  if (!ctx) {
    return NextResponse.json({ onboarded: false });
  }
  return NextResponse.json({
    onboarded: true,
    centerId: ctx.centerId,
    centerName: ctx.centerName,
    centerKind: ctx.centerKind,
    role: ctx.role,
    accessLevel: ctx.accessLevel,
    isSoloOwner: ctx.isSoloOwner,
  });
}

/**
 * POST /api/crm/bootstrap
 *
 * body:
 *   { mode: 'solo' }                                 → 1인 강사: 가상 센터 자동 생성
 *   { mode: 'center', name, phone?, region_sido?, region_sigungu? } → 센터 사장님
 *
 * 멱등성: 이미 멤버십 있으면 그 컨텍스트 그대로 반환 (중복 호출 안전).
 */
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

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

  let body: {
    mode?: "solo" | "center";
    name?: string;
    phone?: string;
    region_sido?: string;
    region_sigungu?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const mode = body.mode;
  if (mode !== "solo" && mode !== "center") {
    return NextResponse.json({ error: "mode 값이 잘못됨" }, { status: 400 });
  }

  // 닉네임을 표시명 기본값으로 사용
  const { data: nick } = await supabase
    .from("nicknames")
    .select("name")
    .eq("firebase_uid", user.uid)
    .maybeSingle();
  const displayName = nick?.name || user.email?.split("@")[0] || "사용자";

  const centerName =
    mode === "solo"
      ? `${displayName}의 수업`
      : (body.name?.trim() || "");

  if (mode === "center" && !centerName) {
    return NextResponse.json({ error: "센터명을 입력해주세요" }, { status: 400 });
  }

  // 1) 센터 생성
  const { data: center, error: centerErr } = await supabase
    .from("crm_centers")
    .insert({
      owner_uid: user.uid,
      name: centerName,
      kind: mode,
      phone: body.phone ?? null,
      region_sido: body.region_sido ?? null,
      region_sigungu: body.region_sigungu ?? null,
    })
    .select("id")
    .single();

  if (centerErr || !center) {
    return NextResponse.json(
      { error: "센터 생성 실패", detail: centerErr?.message },
      { status: 500 }
    );
  }

  // 2) 본인 멤버십 생성
  //    solo: trainer role + is_solo_owner=true + admin 권한 (1인 강사는 본인이 대표)
  //    center: owner role + admin 권한 (등록한 사람이 대표자)
  const role = mode === "solo" ? "trainer" : "owner";
  const { data: member, error: memberErr } = await supabase
    .from("crm_center_members")
    .insert({
      center_id: center.id,
      firebase_uid: user.uid,
      role,
      display_name: displayName,
      email: user.email ?? null,
      access_level: "admin",
      is_solo_owner: mode === "solo",
      status: "active",
    })
    .select("id")
    .single();

  if (memberErr || !member) {
    // 롤백: 방금 만든 센터 삭제
    await supabase.from("crm_centers").delete().eq("id", center.id);
    return NextResponse.json(
      { error: "멤버십 생성 실패", detail: memberErr?.message },
      { status: 500 }
    );
  }

  // 3) solo 모드는 본인이 강사이기도 하니 권한표도 한 줄 (전부 true 기본)
  if (mode === "solo") {
    await supabase.from("crm_trainer_permissions").insert({
      center_member_id: member.id,
      can_create_reservation: true,
      can_modify_reservation: true,
      can_cancel_reservation: true,
      attendance_mode: "trainer",
      can_cancel_attendance: true,
      can_issue_pass: true,
    });
  }

  // 4) 센터 기본 설정 row (PDF 7)
  await supabase.from("crm_center_settings").insert({
    center_id: center.id,
    // 기본값은 스키마 DEFAULT로 채워짐
  });

  // 5) 기본 4개 시스템 등급 시드
  const seedGrades: { center_id: number; base_role: string; label: string; is_system: boolean; sort_order: number }[] = [
    { center_id: center.id, base_role: "owner",   label: "대표자", is_system: true, sort_order: 0 },
    { center_id: center.id, base_role: "admin",   label: "관리자", is_system: true, sort_order: 1 },
    { center_id: center.id, base_role: "manager", label: "팀장",   is_system: true, sort_order: 2 },
    { center_id: center.id, base_role: "trainer", label: "강사",   is_system: true, sort_order: 3 },
  ];
  const { data: insertedGrades } = await supabase
    .from("crm_grades")
    .insert(seedGrades)
    .select("id, base_role");

  // 본인 멤버의 grade_id 도 설정
  const myGrade = insertedGrades?.find((g) => g.base_role === role);
  if (myGrade) {
    await supabase
      .from("crm_center_members")
      .update({ grade_id: myGrade.id } as never)
      .eq("id", member.id);
  }

  return NextResponse.json({
    onboarded: true,
    centerId: center.id,
    centerName,
    centerKind: mode,
    role,
    accessLevel: "admin",
    isSoloOwner: mode === "solo",
  });
}
