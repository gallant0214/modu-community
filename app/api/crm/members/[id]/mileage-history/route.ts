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
  center_add: "센터 지급",
  center_deduct: "센터 차감",
  adjust: "센터 지급", // 구버전 원장(방향은 delta 로 구분)
  checkout: "퇴실 적립",
  attendance: "출석 적립",
  broj_import: "이관 전 누적",
  order_refund: "환불 정산", // 방향에 따라 아래에서 더 정확한 문구로 바꾼다
};

/** 직원이 손으로 넣고 뺀 건 — 담당자·메모를 활동 로그에서 붙인다 */
const MANUAL_REASONS = new Set(["center_add", "center_deduct", "adjust"]);

function reasonLabel(reason: string, delta: number): string {
  if (MANUAL_REASONS.has(reason)) return delta < 0 ? "센터 차감" : "센터 지급";
  // 환불 정산은 방향이 곧 의미다 — 쓴 마일리지를 돌려받은 건지, 적립분을 회수당한 건지
  if (reason === "order_refund") return delta < 0 ? "환불로 적립 회수" : "환불로 반환";
  return REASON_LABEL[reason] ?? reason;
}

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

  const [{ data: logs }, { data: atts }, { data: audits }, { data: ms }, { data: rs }] = await Promise.all([
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
      .select("action, entity_id, payload, created_at, actor_uid")
      .eq("center_id", ctx.centerId)
      .in("action", ["member.mileage_adjust", "members.bulk_mileage"])
      // 개별 조정은 이 회원 건만, 일괄 지급은 payload.member_ids 로 아래에서 거른다
      .or(`entity_id.eq.${memberId},action.eq.members.bulk_mileage`)
      .order("created_at", { ascending: false })
      .limit(200),
    // 결제 적립·사용이 어느 상품에서 났는지 — 같은 시각(±5초) 발급 건과 맞춰 상품명을 붙인다
    supabase
      .from("crm_memberships")
      .select("plan_name, mileage_earned, mileage_used, created_at")
      .eq("center_id", ctx.centerId)
      .eq("member_id", memberId)
      .or("mileage_earned.gt.0,mileage_used.gt.0")
      .limit(300),
    supabase
      .from("crm_rentals")
      .select("item_name, mileage_earned, mileage_used, created_at")
      .eq("center_id", ctx.centerId)
      .eq("member_id", memberId)
      .or("mileage_earned.gt.0,mileage_used.gt.0")
      .limit(300),
  ]);

  // 상품 매칭용 목록 (적립/사용 각각)
  const products = [
    ...((ms ?? []) as { plan_name: string; mileage_earned: number | null; mileage_used: number | null; created_at: string }[]).map(
      (m) => ({ name: m.plan_name, earned: m.mileage_earned ?? 0, used: m.mileage_used ?? 0, at: Date.parse(m.created_at) })
    ),
    ...((rs ?? []) as { item_name: string; mileage_earned: number | null; mileage_used: number | null; created_at: string }[]).map(
      (r) => ({ name: r.item_name, earned: r.mileage_earned ?? 0, used: r.mileage_used ?? 0, at: Date.parse(r.created_at) })
    ),
  ];
  const productFor = (reason: string, delta: number, createdAt: string): string | null => {
    if (reason !== "earn" && reason !== "use") return null;
    const t = Date.parse(createdAt);
    const want = Math.abs(delta);
    const hit = products.find(
      (p) => Math.abs(p.at - t) <= 5000 && (reason === "earn" ? p.earned === want : p.used === want)
    );
    return hit?.name ?? null;
  };

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
  // 개별 조정(member.mileage_adjust)과 일괄 지급(members.bulk_mileage) 둘 다 담당자 후보로 쓴다
  const auditRows = ((audits ?? []) as {
    action: string;
    entity_id: number | null;
    payload: { delta?: number; amount?: number; memo?: string | null; member_ids?: number[]; reason?: string | null } | null;
    created_at: string;
    actor_uid: string | null;
  }[])
    .filter((a) =>
      a.action === "members.bulk_mileage"
        ? (a.payload?.member_ids ?? []).map(Number).includes(memberId)
        : Number(a.entity_id) === memberId
    )
    .map((a) => ({
      at: Date.parse(a.created_at),
      delta: Number(a.payload?.delta ?? a.payload?.amount ?? 0),
      memo: a.payload?.memo ?? a.payload?.reason ?? null,
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
    if (MANUAL_REASONS.has(l.reason)) {
      const t = Date.parse(l.created_at);
      const hit = auditRows.find((a) => a.delta === l.delta && Math.abs(a.at - t) <= 5000);
      if (hit) {
        by = hit.by;
        memo = hit.memo;
      }
    }
    const product = productFor(l.reason, l.delta, l.created_at);
    if (!memo && product) memo = product;
    entries.push({
      id: `l-${l.id}`,
      delta: l.delta,
      reason: l.reason,
      label: reasonLabel(l.reason, l.delta),
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
