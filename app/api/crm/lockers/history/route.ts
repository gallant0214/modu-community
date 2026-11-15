import { errDetail } from "@/app/lib/api-error";
import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/lockers/history?action=return|assign|move|broken|repaired|all&zone=
 *
 * 락커 사용 이력. 기본은 회수(return) 기록.
 * zone 지정 시 그 락커룸의 이력만.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  // 이력에 비밀번호 변경값(from/to)이 포함되므로 lockers.edit 권한자만
  if (!(await ctxHasPermission(ctx, "lockers.edit"))) {
    return NextResponse.json({ error: "락커 이력 열람 권한이 없습니다" }, { status: 403 });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "return";
  const zoneParam = url.searchParams.get("zone");
  const lockerId = url.searchParams.get("locker_id");

  let query = supabase
    .from("crm_locker_history")
    .select(
      "id, locker_id, zone_id, number, action, member_id, member_name, start_date, expires_at, note, changes, actor_uid, created_at"
    )
    .eq("center_id", ctx.centerId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (action !== "all") query = query.eq("action", action);

  if (zoneParam) {
    const zoneNumber = Number(zoneParam);
    const { data: zoneRow } = await supabase
      .from("crm_locker_zones")
      .select("id")
      .eq("center_id", ctx.centerId)
      .eq("zone_number", zoneNumber)
      .maybeSingle();
    if (zoneRow) query = query.eq("zone_id", zoneRow.id);
  }

  if (lockerId) {
    query = query.eq("locker_id", Number(lockerId));
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: errDetail(error) }, { status: 500 });
  }

  // zone_id → zone_number/name 매핑
  const zoneIds = Array.from(new Set((data ?? []).map((d) => d.zone_id)));
  const { data: zones } = zoneIds.length
    ? await supabase
        .from("crm_locker_zones")
        .select("id, zone_number, name")
        .in("id", zoneIds)
    : { data: [] };
  const zoneMap = new Map((zones ?? []).map((z) => [z.id, z]));

  // 처리자 = 이 센터 직원 이름(직원 목록 display_name). 커뮤니티 닉네임('멋진감자' 등)이 아니라.
  //   직원 기록이 없는 uid(예전 테스트 계정 등)만 닉네임으로 대신한다.
  const uids = Array.from(new Set((data ?? []).map((d) => d.actor_uid)));
  const [{ data: staff }, { data: nicks }] = uids.length
    ? await Promise.all([
        supabase
          .from("crm_center_members")
          .select("firebase_uid, display_name")
          .eq("center_id", ctx.centerId)
          .in("firebase_uid", uids),
        supabase.from("nicknames").select("firebase_uid, name").in("firebase_uid", uids),
      ])
    : [{ data: [] }, { data: [] }];
  const staffMap = new Map(
    ((staff ?? []) as { firebase_uid: string; display_name: string | null }[])
      .filter((s) => s.display_name)
      .map((s) => [s.firebase_uid, s.display_name as string])
  );
  const nickMap = new Map((nicks ?? []).map((n) => [n.firebase_uid, n.name]));

  // 회원 이름이 비어 있는 기록(결제 삭제·환불로 자동 회수된 건)은 회원 이름을 채운다
  const nameless = Array.from(
    new Set((data ?? []).filter((d) => d.member_id && !d.member_name).map((d) => d.member_id as number))
  );
  const { data: memberRows } = nameless.length
    ? await supabase.from("crm_members").select("id, name").eq("center_id", ctx.centerId).in("id", nameless)
    : { data: [] };
  const memberName = new Map(((memberRows ?? []) as { id: number; name: string }[]).map((m) => [m.id, m.name]));

  // 🚨 회수 기록의 '만료된 날짜' — 2026-11-15 전 회수 기록은 만료일을 저장하지 않았다.
  //    그 락커의 회수 직전 기록(배정 기간·만료일 변경)에서 마지막으로 알려진 기간을 찾아 채운다(표시만, DB 는 그대로).
  const needPeriod = (data ?? []).filter((d) => d.action === "return" && !d.expires_at && d.locker_id);
  const periodById = new Map<number, { start_date: string | null; expires_at: string | null }>();
  if (needPeriod.length > 0) {
    const lockerIds = Array.from(new Set(needPeriod.map((d) => d.locker_id as number)));
    type H = {
      locker_id: number;
      created_at: string;
      start_date: string | null;
      expires_at: string | null;
      changes: Record<string, { from?: unknown; to?: unknown }> | null;
    };
    const prior: H[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: page } = await supabase
        .from("crm_locker_history")
        .select("locker_id, created_at, start_date, expires_at, changes")
        .eq("center_id", ctx.centerId)
        .in("locker_id", lockerIds)
        .neq("action", "return")
        .order("created_at", { ascending: false })
        .range(from, from + 999);
      prior.push(...((page ?? []) as H[]));
      if (!page || page.length < 1000) break;
    }
    for (const r of needPeriod) {
      let start: string | null = null;
      let exp: string | null = null;
      // 최근 → 과거 순. 만료일·시작일을 각각 처음 만나는 값으로
      for (const h of prior) {
        if (h.locker_id !== r.locker_id || h.created_at >= r.created_at) continue;
        const e = h.expires_at ?? (typeof h.changes?.expires_at?.to === "string" ? (h.changes.expires_at.to as string) : null);
        const s = h.start_date ?? (typeof h.changes?.start_date?.to === "string" ? (h.changes.start_date.to as string) : null);
        if (!exp && e) exp = e;
        if (!start && s) start = s;
        if (exp && start) break;
      }
      if (exp || start) periodById.set(r.id, { start_date: start, expires_at: exp });
    }
  }

  return NextResponse.json({
    history: (data ?? []).map((d) => {
      const p = periodById.get(d.id);
      return {
        ...d,
        member_name: d.member_name ?? (d.member_id ? memberName.get(d.member_id) ?? null : null),
        start_date: d.start_date ?? p?.start_date ?? null,
        expires_at: d.expires_at ?? p?.expires_at ?? null,
        zone_name: zoneMap.get(d.zone_id)?.name ?? `구역 ${zoneMap.get(d.zone_id)?.zone_number ?? "?"}`,
        actor_name: staffMap.get(d.actor_uid) ?? nickMap.get(d.actor_uid) ?? "—",
      };
    }),
  });
}
