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
 *
 * 실행자 이름(actor_name)도 함께 반환 → "누가" 했는지 추적.
 * actor_uid 가 'system:*' 이면 자동 처리이므로 한글 라벨로 바꿔 준다.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 200), 1), 500);
  // 기간 필터 (YYYY-MM-DD, KST 기준). 둘 다 선택
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  let query = supabase
    .from("crm_audit_logs")
    .select("id, actor_uid, action, entity_type, entity_id, payload, created_at")
    .eq("center_id", ctx.centerId);
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    query = query.gte("created_at", new Date(`${from}T00:00:00+09:00`).toISOString());
  }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    // 종료일 포함 → 다음날 0시 미만
    const end = new Date(new Date(`${to}T00:00:00+09:00`).getTime() + 24 * 3600 * 1000);
    query = query.lt("created_at", end.toISOString());
  }
  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);

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
  const phoneMap = new Map<number, string>();
  if (allMemberIds.size > 0) {
    const { data: members } = await supabase
      .from("crm_members")
      .select("id, name, phone")
      .eq("center_id", ctx.centerId)
      .in("id", Array.from(allMemberIds));
    for (const m of members ?? []) {
      nameMap.set(m.id, m.name);
      if (m.phone) phoneMap.set(m.id, m.phone);
    }
  }

  // 실행자 이름 resolve — actor_uid(firebase_uid) → crm_center_members.display_name
  // 퇴사자도 보여야 하므로 status 로 걸러내지 않는다. 다른 센터 소속 UID 는 센터 조건 없이 한 번 더 찾는다.
  const SYSTEM_ACTOR_LABEL: Record<string, string> = {
    "system:cron": "시스템 (자동 처리)",
    "system:toss-webhook": "시스템 (온라인 결제)",
    "system:portone-webhook": "시스템 (온라인 결제)",
    "system:fix": "시스템 (데이터 보정)",
  };
  const actorUids = Array.from(
    new Set(logs.map((l) => l.actor_uid).filter((u): u is string => !!u && !u.startsWith("system:")))
  );
  const actorMap = new Map<string, string>();
  if (actorUids.length > 0) {
    const { data: inCenter } = await supabase
      .from("crm_center_members")
      .select("firebase_uid, display_name")
      .eq("center_id", ctx.centerId)
      .in("firebase_uid", actorUids);
    for (const a of inCenter ?? []) {
      if (a.display_name) actorMap.set(a.firebase_uid, a.display_name);
    }
    const missing = actorUids.filter((u) => !actorMap.has(u));
    if (missing.length > 0) {
      const { data: anyCenter } = await supabase
        .from("crm_center_members")
        .select("firebase_uid, display_name")
        .in("firebase_uid", missing);
      for (const a of anyCenter ?? []) {
        if (a.display_name && !actorMap.has(a.firebase_uid)) actorMap.set(a.firebase_uid, a.display_name);
      }
    }
  }

  // payload 안의 직원 id(담당강사·판매자·추가강사)를 이름으로 — 요약에서 "담당 강사 홍길동" 처럼 보이게
  const staffIds = new Set<number>();
  for (const l of logs) {
    const p = l.payload as Record<string, unknown> | null;
    if (!p || typeof p !== "object") continue;
    for (const [k, v] of Object.entries(p)) {
      if (k.endsWith("_member_id") && typeof v === "number") staffIds.add(v);
      if (k === "co_trainer_ids" && Array.isArray(v)) v.forEach((x) => typeof x === "number" && staffIds.add(x));
    }
  }
  const names: Record<number, string> = {};
  if (staffIds.size > 0) {
    const { data: staff } = await supabase
      .from("crm_center_members")
      .select("id, display_name")
      .eq("center_id", ctx.centerId)
      .in("id", Array.from(staffIds));
    for (const s of staff ?? []) if (s.display_name) names[s.id] = s.display_name;
  }

  const enriched = logs.map((l) => {
    let memberId: number | undefined;
    if (l.entity_type === "member" && l.entity_id) memberId = l.entity_id;
    else if (l.entity_id) memberId = entityToMember.get(`${l.entity_type}:${l.entity_id}`);
    const actorName = l.actor_uid?.startsWith("system:")
      ? SYSTEM_ACTOR_LABEL[l.actor_uid] ?? "시스템"
      : actorMap.get(l.actor_uid) ?? null;
    return {
      ...l,
      subject_name: memberId ? nameMap.get(memberId) ?? null : null,
      subject_phone: memberId ? phoneMap.get(memberId) ?? null : null,
      actor_name: actorName,
    };
  });

  return NextResponse.json({ logs: enriched, names });
}
