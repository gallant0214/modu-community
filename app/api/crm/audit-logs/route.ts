import { errDetail } from "@/app/lib/api-error";
import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { requirePermission } from "@/app/lib/crm-permissions";

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
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  const permDenied = await requirePermission(ctx, "settings.audit_log");
  if (permDenied) return permDenied;

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
    return NextResponse.json({ error: "조회 실패", detail: errDetail(error) }, { status: 500 });
  }

  const logs = data ?? [];

  // 대상 회원 이름·상품명 resolve — entity_type 별로 member_id(와 상품명)를 찾아 매핑.
  // 🚨 같은 테이블이 두 이름(pass / crm_passes 등)으로 남아 있어 둘 다 받는다.
  type ResolverTable =
    | "crm_memberships" | "crm_rentals" | "crm_passes" | "crm_reservations" | "crm_payments"
    | "crm_pauses" | "crm_signed_contracts" | "crm_member_workout_logs" | "crm_pt_consultations";
  const RESOLVERS: Record<string, { table: ResolverTable; cols: string; label?: (r: Record<string, unknown>) => string | null }> = {
    crm_memberships: { table: "crm_memberships", cols: "id, member_id, plan_name", label: (r) => str(r.plan_name) },
    membership: { table: "crm_memberships", cols: "id, member_id, plan_name", label: (r) => str(r.plan_name) },
    crm_rentals: { table: "crm_rentals", cols: "id, member_id, item_name", label: (r) => str(r.item_name) },
    rental: { table: "crm_rentals", cols: "id, member_id, item_name", label: (r) => str(r.item_name) },
    pass: { table: "crm_passes", cols: "id, member_id, lesson_kind", label: (r) => str(r.lesson_kind) },
    crm_passes: { table: "crm_passes", cols: "id, member_id, lesson_kind", label: (r) => str(r.lesson_kind) },
    reservation: { table: "crm_reservations", cols: "id, member_id" },
    crm_payments: { table: "crm_payments", cols: "id, member_id, pass_id, membership_id, rental_id, product_label, amount_won" },
    crm_pauses: { table: "crm_pauses", cols: "id, member_id" },
    crm_signed_contracts: { table: "crm_signed_contracts", cols: "id, member_id, title", label: (r) => str(r.title) },
    crm_member_workout_logs: { table: "crm_member_workout_logs", cols: "id, member_id" },
    crm_pt_consultations: { table: "crm_pt_consultations", cols: "id, member_id, name" },
  };
  const bucket: Record<string, Set<number>> = {};
  const directMemberIds = new Set<number>(); // entity_type === 'member' | 'crm_members'
  for (const l of logs) {
    if (!l.entity_id || !l.entity_type) continue;
    if (l.entity_type === "member" || l.entity_type === "crm_members") directMemberIds.add(l.entity_id);
    else if (RESOLVERS[l.entity_type]) (bucket[l.entity_type] ??= new Set()).add(l.entity_id);
  }

  const entityToMember = new Map<string, number>(); // `${entity_type}:${entity_id}` → member_id
  const entityLabel = new Map<string, string>(); // `${entity_type}:${entity_id}` → 상품명
  const consultName = new Map<string, string>(); // 상담지 — 비회원은 상담자 이름
  const paymentRows: { key: string; pass_id: number | null; membership_id: number | null; rental_id: number | null }[] = [];
  await Promise.all(
    Object.entries(bucket).map(async ([type, idSet]) => {
      const r = RESOLVERS[type];
      const { data: rows } = await supabase
        .from(r.table)
        .select(r.cols)
        .eq("center_id", ctx.centerId)
        .in("id", Array.from(idSet));
      for (const row of (rows ?? []) as unknown as Record<string, unknown>[]) {
        const key = `${type}:${row.id}`;
        if (typeof row.member_id === "number") entityToMember.set(key, row.member_id);
        const label = r.label?.(row);
        if (label) entityLabel.set(key, label);
        if (type === "crm_pt_consultations" && str(row.name)) consultName.set(key, str(row.name)!);
        if (type === "crm_payments") {
          if (str(row.product_label)) entityLabel.set(key, str(row.product_label)!);
          paymentRows.push({
            key,
            pass_id: (row.pass_id as number | null) ?? null,
            membership_id: (row.membership_id as number | null) ?? null,
            rental_id: (row.rental_id as number | null) ?? null,
          });
        }
      }
    })
  );

  // 결제 → 연결된 상품 이름 (회원권·수강권·대여권)
  {
    const need = paymentRows.filter((p) => !entityLabel.has(p.key));
    const ids = (k: "pass_id" | "membership_id" | "rental_id") =>
      Array.from(new Set(need.map((p) => p[k]).filter((v): v is number => typeof v === "number")));
    const [ps, ms, rs] = await Promise.all([
      ids("pass_id").length ? supabase.from("crm_passes").select("id, lesson_kind").in("id", ids("pass_id")) : Promise.resolve({ data: [] }),
      ids("membership_id").length ? supabase.from("crm_memberships").select("id, plan_name").in("id", ids("membership_id")) : Promise.resolve({ data: [] }),
      ids("rental_id").length ? supabase.from("crm_rentals").select("id, item_name").in("id", ids("rental_id")) : Promise.resolve({ data: [] }),
    ]);
    const pm = new Map(((ps.data ?? []) as { id: number; lesson_kind: string | null }[]).map((x) => [x.id, x.lesson_kind]));
    const mm = new Map(((ms.data ?? []) as { id: number; plan_name: string | null }[]).map((x) => [x.id, x.plan_name]));
    const rm = new Map(((rs.data ?? []) as { id: number; item_name: string | null }[]).map((x) => [x.id, x.item_name]));
    for (const p of need) {
      const label =
        (p.membership_id && mm.get(p.membership_id)) ||
        (p.pass_id && pm.get(p.pass_id)) ||
        (p.rental_id && rm.get(p.rental_id)) ||
        null;
      if (label) entityLabel.set(p.key, label);
    }
  }

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
    const key = `${l.entity_type}:${l.entity_id}`;
    if ((l.entity_type === "member" || l.entity_type === "crm_members") && l.entity_id) memberId = l.entity_id;
    else if (l.entity_id) memberId = entityToMember.get(key);
    const actorName = l.actor_uid?.startsWith("system:")
      ? SYSTEM_ACTOR_LABEL[l.actor_uid] ?? "시스템"
      : actorMap.get(l.actor_uid) ?? null;
    return {
      ...l,
      subject_name: memberId ? nameMap.get(memberId) ?? null : consultName.get(key) ?? null,
      subject_phone: memberId ? phoneMap.get(memberId) ?? null : null,
      actor_name: actorName,
      /** 대상 상품 이름 (회원권·수강권·대여권·결제에 연결된 상품·계약서 제목) */
      item_label: entityLabel.get(key) ?? null,
    };
  });

  return NextResponse.json({ logs: enriched, names });
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
