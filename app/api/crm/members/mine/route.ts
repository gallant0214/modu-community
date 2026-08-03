import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/members/mine?q=
 * 내가 등록된 모든 센터에서 "본인에게 배정된" 회원을 한 번에 검색.
 * 여러 센터에서 일하는 강사용.
 *
 * 센터별 범위:
 *  - owner/admin/solo → 그 센터 전체 회원
 *  - trainer/manager  → 본인이 주강사(trainer_member_id)·추가강사(co_trainer_ids)·판매자(seller_member_id)로 연결된 회원 (웹 /api/crm/members 스코프와 동일)
 *
 * 각 회원에 center_id/center_name/trainer_member_id 를 태깅해서 반환
 * (앱에서 상세·발급 시 해당 센터 컨텍스트로 호출하도록).
 */
export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const q = (new URL(request.url).searchParams.get("q") || "").trim();

  const { data: memberships } = await supabase
    .from("crm_center_members")
    .select("id, center_id, role, is_solo_owner, display_name, crm_centers!inner(name, kind)")
    .eq("firebase_uid", user.uid)
    .eq("status", "active");

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ members: [] });
  }

  type OutMember = {
    id: number;
    member_type: string;
    name: string;
    phone: string;
    birth: string | null;
    gender: string | null;
    mileage: number;
    face_image_thumb: string | null;
    items: { kind: string; type: "lesson"; remaining: number | null; total: number; reserved: number; expires: string }[];
    center_id: number;
    center_name: string;
    trainer_member_id: number;
  };

  const out: OutMember[] = [];

  for (const m of memberships) {
    const c = Array.isArray(m.crm_centers)
      ? m.crm_centers[0]
      : (m.crm_centers as { name?: string; kind?: string } | null);
    const storedName = c?.name ?? "";
    // 개인(solo) 센터는 커뮤니티 닉네임으로 이름이 자동 생성됨 → 소유자 실명(display_name)이 있으면
    // "{실명}의 수업" 으로 표시. 실명이 없으면(=닉네임 그대로면) 저장된 이름 사용.
    const displayName = (m as { display_name?: string }).display_name?.trim();
    const centerName =
      c?.kind === "solo" && displayName ? `${displayName}의 수업` : storedName;
    const restricted =
      (m.role === "trainer" || m.role === "manager") && !m.is_solo_owner;

    let allowedIds: number[] | null = null;
    if (restricted) {
      // 주강사(trainer_member_id) · 추가강사(co_trainer_ids) · 판매자(seller_member_id)로 연결된 회원
      // (웹 /api/crm/members·트레이너 대시보드 스코프와 동일하게 3종 모두 포함)
      const { data: passes } = await supabase
        .from("crm_passes")
        .select("member_id")
        .eq("center_id", m.center_id)
        .or(
          `trainer_member_id.eq.${m.id},co_trainer_ids.cs.{${m.id}},seller_member_id.eq.${m.id}`
        );
      allowedIds = Array.from(new Set((passes ?? []).map((p) => p.member_id)));
      if (allowedIds.length === 0) continue;
    }

    let query = supabase
      .from("crm_members")
      .select("id, member_type, name, phone, birth, gender, mileage, face_image_thumb")
      .eq("center_id", m.center_id)
      .eq("status", "active")
      .order("name", { ascending: true })
      .limit(2000);
    if (allowedIds) query = query.in("id", allowedIds);
    if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);

    const { data: members } = await query;
    if (!members || members.length === 0) continue;

    const ids = members.map((x) => x.id);
    const { data: passesData } = await supabase
      .from("crm_passes")
      .select("id, member_id, lesson_kind, remaining_sessions, total_sessions, expires_at")
      .eq("center_id", m.center_id)
      .in("member_id", ids)
      .eq("status", "valid");

    // 수강권별 예약 건수(취소·반려 제외) → 예약가능 = 총 횟수 - 예약 건수
    const passIds = (passesData ?? []).map((p) => p.id);
    const reservedMap = new Map<number, number>();
    if (passIds.length > 0) {
      const { data: resv } = await supabase
        .from("crm_reservations")
        .select("pass_id")
        .eq("center_id", m.center_id)
        .in("pass_id", passIds)
        .not("status", "in", "(cancelled,rejected)");
      for (const r of resv ?? []) {
        if (r.pass_id == null) continue;
        reservedMap.set(r.pass_id, (reservedMap.get(r.pass_id) ?? 0) + 1);
      }
    }

    const passMap = new Map<number, OutMember["items"]>();
    for (const p of passesData ?? []) {
      const arr = passMap.get(p.member_id) ?? [];
      arr.push({
        kind: p.lesson_kind,
        type: "lesson",
        remaining: p.remaining_sessions,
        total: p.total_sessions,
        reserved: reservedMap.get(p.id) ?? 0,
        expires: p.expires_at,
      });
      passMap.set(p.member_id, arr);
    }

    for (const mem of members) {
      out.push({
        id: mem.id,
        member_type: mem.member_type,
        name: mem.name,
        phone: mem.phone ?? "",
        birth: mem.birth,
        gender: mem.gender,
        mileage: mem.mileage,
        face_image_thumb: mem.face_image_thumb,
        items: passMap.get(mem.id) ?? [],
        center_id: m.center_id,
        center_name: centerName ?? "",
        trainer_member_id: m.id,
      });
    }
  }

  out.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return NextResponse.json({ members: out });
}
