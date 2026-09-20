import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/members/[id]/mileage-history
 * 회원 상세 '마일리지' 탭 — 마일리지 전체 기록.
 *
 * 두 곳을 합친다:
 *   1) crm_member_mileage_logs — 결제 적립/사용, 센터 지급·차감(adjust), 퇴실 적립(checkout), 이관(broj_import)
 *   2) crm_attendances.attendance_mileage_awarded — 출석 적립(원장에 안 남는 경로)
 * 센터 조정 건은 활동 로그(member.mileage_adjust)에서 담당자·메모를 붙인다.
 */
const REASON_LABEL: Record<string, string> = {
  earn: "결제 적립",
  use: "결제 사용",
  adjust: "센터 지급·차감",
  checkout: "퇴실 적립",
  attendance: "출석 적립",
  broj_import: "이관(기존 데이터)",
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const memberId = Number((await params).id);
  if (!memberId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { data: member } = await supabase
    .from("crm_members")
    .select("id, mileage")
    .eq("id", memberId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: "회원을 찾을 수 없습니다" }, { status: 404 });

  const [{ data: logs }, { data: atts }, { data: audits }] = await Promise.all([
    supabase
      .from("crm_member_mileage_logs")
      .select("id, delta, reason, balance_after, created_at")
      .eq("center_id", ctx.centerId)
      .eq("member_id", memberId)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("crm_attendances")
      .select("id, attendance_mileage_awarded, checked_in_at")
      .eq("center_id", ctx.centerId)
      .eq("member_id", memberId)
      .gt("attendance_mileage_awarded", 0)
      .order("checked_in_at", { ascending: false })
      .limit(500),
    supabase
      .from("crm_audit_logs")
      .select("payload, created_at, actor_uid")
      .eq("center_id", ctx.centerId)
      .eq("action", "member.mileage_adjust")
      .eq("entity_id", memberId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  // 센터 조정 담당자 이름 — actor_uid → 직원명
  const uids = Array.from(
    new Set(((audits ?? []) as { actor_uid: string | null }[]).map((a) => a.actor_uid).filter(Boolean))
  ) as string[];
  const nameByUid = new Map<string, string>();
  if (uids.length > 0) {
    const { data: staff } = await supabase
      .from("crm_center_members")
      .select("firebase_uid, display_name")
      .eq("center_id", ctx.centerId)
      .in("firebase_uid", uids);
    for (const s of (staff ?? []) as { firebase_uid: string; display_name: string | null }[]) {
      if (s.display_name) nameByUid.set(s.firebase_uid, s.display_name);
    }
  }
  const auditRows = ((audits ?? []) as {
    payload: { delta?: number; memo?: string | null } | null;
    created_at: string;
    actor_uid: string | null;
  }[]).map((a) => ({
    at: Date.parse(a.created_at),
    delta: Number(a.payload?.delta ?? 0),
    memo: a.payload?.memo ?? null,
    by: a.actor_uid ? nameByUid.get(a.actor_uid) ?? null : null,
  }));

  interface Entry {
    id: string;
    delta: number;
    reason: string;
    label: string;
    at: string;
    balanceAfter: number | null;
    by: string | null;
    memo: string | null;
  }
  const entries: Entry[] = [];

  for (const l of (logs ?? []) as {
    id: number;
    delta: number;
    reason: string;
    balance_after: number | null;
    created_at: string;
  }[]) {
    // 센터 조정이면 같은 금액·시각(±5초)의 활동 로그에서 담당자·메모를 찾는다
    let by: string | null = null;
    let memo: string | null = null;
    if (l.reason === "adjust") {
      const t = Date.parse(l.created_at);
      const hit = auditRows.find((a) => a.delta === l.delta && Math.abs(a.at - t) <= 5000);
      if (hit) {
        by = hit.by;
        memo = hit.memo;
      }
    }
    entries.push({
      id: `l-${l.id}`,
      delta: l.delta,
      reason: l.reason,
      label: REASON_LABEL[l.reason] ?? l.reason,
      at: l.created_at,
      balanceAfter: l.balance_after,
      by,
      memo,
    });
  }

  for (const a of (atts ?? []) as {
    id: number;
    attendance_mileage_awarded: number | null;
    checked_in_at: string;
  }[]) {
    entries.push({
      id: `a-${a.id}`,
      delta: a.attendance_mileage_awarded ?? 0,
      reason: "attendance",
      label: REASON_LABEL.attendance,
      at: a.checked_in_at,
      balanceAfter: null,
      by: null,
      memo: null,
    });
  }

  entries.sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));

  const earned = entries.filter((e) => e.delta > 0).reduce((s, e) => s + e.delta, 0);
  const used = entries.filter((e) => e.delta < 0).reduce((s, e) => s + Math.abs(e.delta), 0);

  return NextResponse.json({
    balance: (member as { mileage?: number }).mileage ?? 0,
    earned,
    used,
    entries: entries.slice(0, 300),
  });
}
