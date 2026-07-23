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
 *  - trainer/manager  → 본인(trainer_member_id) 담당 회원만
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
    .select("id, center_id, role, is_solo_owner, crm_centers!inner(name)")
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
    items: { kind: string; type: "lesson"; remaining: number | null; total: number; expires: string }[];
    center_id: number;
    center_name: string;
    trainer_member_id: number;
  };

  const out: OutMember[] = [];

  for (const m of memberships) {
    const centerName = Array.isArray(m.crm_centers)
      ? m.crm_centers[0]?.name
      : (m.crm_centers as { name?: string } | null)?.name;
    const restricted =
      (m.role === "trainer" || m.role === "manager") && !m.is_solo_owner;

    let allowedIds: number[] | null = null;
    if (restricted) {
      const { data: passes } = await supabase
        .from("crm_passes")
        .select("member_id")
        .eq("center_id", m.center_id)
        .eq("trainer_member_id", m.id);
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
      .select("member_id, lesson_kind, remaining_sessions, total_sessions, expires_at")
      .eq("center_id", m.center_id)
      .in("member_id", ids)
      .eq("status", "valid");

    const passMap = new Map<number, OutMember["items"]>();
    for (const p of passesData ?? []) {
      const arr = passMap.get(p.member_id) ?? [];
      arr.push({
        kind: p.lesson_kind,
        type: "lesson",
        remaining: p.remaining_sessions,
        total: p.total_sessions,
        expires: p.expires_at,
      });
      passMap.set(p.member_id, arr);
    }

    for (const mem of members) {
      out.push({
        id: mem.id,
        member_type: mem.member_type,
        name: mem.name,
        phone: mem.phone,
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
