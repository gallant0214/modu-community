import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/members/[id]/logs
 * 이 회원과 관련된 변경 기록 (audit log).
 *
 * 수집 대상:
 *   1) entity_type='member' AND entity_id=memberId (회원 본인 변경)
 *   2) 이 회원 소유의 crm_passes / crm_memberships / crm_lockers 관련 로그
 *   3) payload.member_id = memberId 를 포함한 로그
 *
 * 응답: [{ id, action, entity_type, entity_id, actor_uid, actor_name, created_at, payload }]
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const memberId = Number(id);
  if (!memberId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  // 1. 회원 소유 관련 엔티티 ID 수집
  const [passIds, membershipIds] = await Promise.all([
    supabase
      .from("crm_passes")
      .select("id")
      .eq("center_id", ctx.centerId)
      .eq("member_id", memberId),
    supabase
      .from("crm_memberships")
      .select("id")
      .eq("center_id", ctx.centerId)
      .eq("member_id", memberId),
  ]);
  const passIdList = (passIds.data ?? []).map((p) => p.id);
  const memIdList = (membershipIds.data ?? []).map((m) => m.id);

  // 2. entity_type = 'member' AND entity_id = memberId
  const rows: Row[] = [];
  const memberLogs = await supabase
    .from("crm_audit_logs")
    .select("id, action, entity_type, entity_id, actor_uid, payload, created_at")
    .eq("center_id", ctx.centerId)
    .eq("entity_type", "member")
    .eq("entity_id", memberId)
    .order("created_at", { ascending: false })
    .limit(200);
  rows.push(...((memberLogs.data ?? []) as Row[]));

  // 3. 회원 소유 pass 관련 로그
  if (passIdList.length > 0) {
    const passLogs = await supabase
      .from("crm_audit_logs")
      .select("id, action, entity_type, entity_id, actor_uid, payload, created_at")
      .eq("center_id", ctx.centerId)
      .in("entity_type", ["crm_passes", "pass"])
      .in("entity_id", passIdList)
      .order("created_at", { ascending: false })
      .limit(200);
    rows.push(...((passLogs.data ?? []) as Row[]));
  }
  // 4. 회원 소유 membership 관련 로그
  if (memIdList.length > 0) {
    const memLogs = await supabase
      .from("crm_audit_logs")
      .select("id, action, entity_type, entity_id, actor_uid, payload, created_at")
      .eq("center_id", ctx.centerId)
      .in("entity_type", ["crm_memberships", "membership"])
      .in("entity_id", memIdList)
      .order("created_at", { ascending: false })
      .limit(200);
    rows.push(...((memLogs.data ?? []) as Row[]));
  }

  // 5. payload.member_id = memberId 인 케이스 (예약·계약 등)
  const payloadLogs = await supabase
    .from("crm_audit_logs")
    .select("id, action, entity_type, entity_id, actor_uid, payload, created_at")
    .eq("center_id", ctx.centerId)
    .contains("payload", { member_id: memberId } as never)
    .order("created_at", { ascending: false })
    .limit(200);
  rows.push(...((payloadLogs.data ?? []) as Row[]));

  // 중복 제거 (id 기준)
  const seen = new Set<number>();
  const deduped = rows.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
  // 정렬
  deduped.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  // 행위자 이름 조회
  const uids = Array.from(new Set(deduped.map((r) => r.actor_uid)));
  const nameMap = new Map<string, string>();
  if (uids.length > 0) {
    const { data: staff } = await supabase
      .from("crm_center_members")
      .select("firebase_uid, display_name")
      .eq("center_id", ctx.centerId)
      .in("firebase_uid", uids);
    for (const s of staff ?? []) {
      if (s.firebase_uid) nameMap.set(s.firebase_uid, s.display_name);
    }
  }

  return NextResponse.json({
    logs: deduped.slice(0, 300).map((r) => ({
      ...r,
      actor_name: nameMap.get(r.actor_uid) ?? null,
    })),
  });
}

interface Row {
  id: number;
  action: string;
  entity_type: string;
  entity_id: number | null;
  actor_uid: string;
  payload: unknown;
  created_at: string;
}
