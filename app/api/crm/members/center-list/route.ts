import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";
import type { CrmContext } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

/**
 * GET /api/crm/members/center-list?centerId=&page=&q=
 * 강사앱 '회원목록 보기' — 센터 전체 회원(활성) 목록.
 * 권한: 대표/1인 강사, 또는 그 센터에서 members.app_view_all 권한이 켜진 등급.
 * face_image_thumb 가 커서 페이지네이션(30/page). 각 회원의 대표 회원권/수강권 요약 포함.
 */
export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const url = new URL(request.url);
  const centerId = Number(url.searchParams.get("centerId"));
  const page = Math.max(0, Number(url.searchParams.get("page")) || 0);
  const q = (url.searchParams.get("q") || "").trim();
  if (!centerId) return NextResponse.json({ error: "센터가 필요합니다" }, { status: 400 });

  // 이 센터에서의 내 신원(권한 판단)
  const { data: me } = await supabase
    .from("crm_center_members")
    .select("id, role, grade_id, is_solo_owner")
    .eq("firebase_uid", user.uid)
    .eq("center_id", centerId)
    .eq("status", "active")
    .maybeSingle();
  if (!me) return NextResponse.json({ error: "이 센터 소속이 아닙니다" }, { status: 403 });

  // 권한: owner/solo 는 항상, 그 외는 members.app_view_all
  let allowed = me.is_solo_owner || me.role === "owner";
  if (!allowed) {
    const perms = await loadPermissionsForContext({
      centerId,
      role: me.role,
      gradeId: me.grade_id ?? null,
    } as CrmContext);
    allowed = perms["members.app_view_all"] === true;
  }
  if (!allowed) {
    return NextResponse.json({ error: "회원목록 열람 권한이 없습니다" }, { status: 403 });
  }

  // 회원 페이지 (활성)
  let mq = supabase
    .from("crm_members")
    .select("id, name, phone, status, face_image_thumb", { count: "exact" })
    .eq("center_id", centerId)
    .eq("status", "active")
    .order("name", { ascending: true })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
  if (q) mq = mq.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);

  const { data: members, count, error } = await mq;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  const list = members ?? [];
  const ids = list.map((m) => m.id);

  // 대표 요약: 회원권(우선) → 없으면 수강권. 만료 늦은 순으로 첫 번째.
  const primaryMap = new Map<number, { label: string; expires_at: string | null }>();
  if (ids.length > 0) {
    const [{ data: mss }, { data: pss }] = await Promise.all([
      supabase
        .from("crm_memberships")
        .select("member_id, plan_name, expires_at")
        .eq("center_id", centerId)
        .eq("status", "valid")
        .in("member_id", ids)
        .order("expires_at", { ascending: false }),
      supabase
        .from("crm_passes")
        .select("member_id, lesson_kind, remaining_sessions, total_sessions, expires_at")
        .eq("center_id", centerId)
        .eq("status", "valid")
        .in("member_id", ids)
        .order("expires_at", { ascending: false }),
    ]);
    for (const m of mss ?? []) {
      if (!primaryMap.has(m.member_id)) {
        primaryMap.set(m.member_id, { label: m.plan_name, expires_at: m.expires_at });
      }
    }
    for (const p of pss ?? []) {
      if (!primaryMap.has(p.member_id)) {
        const total = p.total_sessions ?? 0;
        const cnt = total > 0 ? ` ${p.remaining_sessions}/${total}회` : "";
        const name = (p.lesson_kind || "").replace(/\s*\(\d+\s*회\)\s*$/, "").trim();
        primaryMap.set(p.member_id, { label: `${name}${cnt}`, expires_at: p.expires_at });
      }
    }
  }

  const out = list.map((m) => ({
    id: m.id,
    name: m.name,
    phone: m.phone ?? "",
    status: m.status,
    face_image_thumb: m.face_image_thumb ?? null,
    primary: primaryMap.get(m.id) ?? null,
  }));

  const total = count ?? 0;
  const hasMore = page * PAGE_SIZE + list.length < total;
  return NextResponse.json({ members: out, total, hasMore, page });
}
