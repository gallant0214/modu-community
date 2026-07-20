import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/audit-logs?limit=
 * 최근 활동 로그. owner/admin 만.
 *
 * 각 로그의 대상 회원 이름(subject_name)을 함께 반환 →
 * "누구의" 회원권/수강권을 수정했는지 표시.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200);

  const { data, error } = await supabase
    .from("crm_audit_logs")
    .select("id, actor_uid, action, entity_type, entity_id, payload, created_at")
    .eq("center_id", ctx.centerId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  const logs = data ?? [];

  // 대상 회원 이름 resolve — entity_type 별로 member_id 를 찾아 이름 매핑
  const directMemberIds = new Set<number>(); // entity_type === 'member'
  const bucket: Record<string, Set<number>> = {
    crm_memberships: new Set(),
    crm_rentals: new Set(),
    pass: new Set(),
    reservation: new Set(),
  };
  for (const l of logs) {
    if (!l.entity_id) continue;
    if (l.entity_type === "member") directMemberIds.add(l.entity_id);
    else if (l.entity_type && bucket[l.entity_type]) bucket[l.entity_type].add(l.entity_id);
  }

  // entity_id → member_id 해석 (테이블별 배치 조회)
  const entityToMember = new Map<string, number>(); // `${entity_type}:${entity_id}` → member_id
  const resolvers: { type: string; table: "crm_memberships" | "crm_rentals" | "crm_passes" | "crm_reservations" }[] = [
    { type: "crm_memberships", table: "crm_memberships" },
    { type: "crm_rentals", table: "crm_rentals" },
    { type: "pass", table: "crm_passes" },
    { type: "reservation", table: "crm_reservations" },
  ];
  await Promise.all(
    resolvers.map(async ({ type, table }) => {
      const ids = Array.from(bucket[type]);
      if (ids.length === 0) return;
      const { data: rows } = await supabase
        .from(table)
        .select("id, member_id")
        .eq("center_id", ctx.centerId)
        .in("id", ids);
      for (const r of rows ?? []) {
        if (r.member_id) entityToMember.set(`${type}:${r.id}`, r.member_id);
      }
    })
  );

  // 전체 member_id 모아 이름 조회
  const allMemberIds = new Set<number>(directMemberIds);
  for (const mid of entityToMember.values()) allMemberIds.add(mid);
  const nameMap = new Map<number, string>();
  if (allMemberIds.size > 0) {
    const { data: members } = await supabase
      .from("crm_members")
      .select("id, name")
      .eq("center_id", ctx.centerId)
      .in("id", Array.from(allMemberIds));
    for (const m of members ?? []) nameMap.set(m.id, m.name);
  }

  const enriched = logs.map((l) => {
    let memberId: number | undefined;
    if (l.entity_type === "member" && l.entity_id) memberId = l.entity_id;
    else if (l.entity_id) memberId = entityToMember.get(`${l.entity_type}:${l.entity_id}`);
    return { ...l, subject_name: memberId ? nameMap.get(memberId) ?? null : null };
  });

  return NextResponse.json({ logs: enriched });
}
