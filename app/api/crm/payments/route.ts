import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

const METHODS = ["cash", "card", "transfer", "etc"] as const;

/**
 * GET /api/crm/payments?member_id=&pass_id=&membership_id=&outstanding=1
 *
 * 결제 내역 조회.
 * outstanding=1 → 미수금이 있는 회원만 (passes/memberships 기준)
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const memberId = url.searchParams.get("member_id");
  const passId = url.searchParams.get("pass_id");
  const membershipId = url.searchParams.get("membership_id");
  const outstandingOnly = url.searchParams.get("outstanding") === "1";

  // 미수금 회원 + 미수액 총합 모드
  if (outstandingOnly) {
    const [passesRes, mbRes] = await Promise.all([
      supabase
        .from("crm_passes")
        .select("member_id, outstanding_won, lesson_kind")
        .eq("center_id", ctx.centerId)
        .gt("outstanding_won", 0)
        .in("status", ["valid", "expired"]),
      supabase
        .from("crm_memberships")
        .select("member_id, outstanding_won, plan_name")
        .eq("center_id", ctx.centerId)
        .gt("outstanding_won", 0)
        .in("status", ["valid", "expired"]),
    ]);
    const map = new Map<
      number,
      { member_id: number; total: number; items: { kind: string; outstanding: number }[] }
    >();
    for (const p of passesRes.data ?? []) {
      const cur = map.get(p.member_id) ?? { member_id: p.member_id, total: 0, items: [] };
      cur.total += p.outstanding_won;
      cur.items.push({ kind: p.lesson_kind, outstanding: p.outstanding_won });
      map.set(p.member_id, cur);
    }
    for (const m of mbRes.data ?? []) {
      const cur = map.get(m.member_id) ?? { member_id: m.member_id, total: 0, items: [] };
      cur.total += m.outstanding_won;
      cur.items.push({ kind: m.plan_name, outstanding: m.outstanding_won });
      map.set(m.member_id, cur);
    }
    const memberIds = Array.from(map.keys());
    const { data: members } = memberIds.length
      ? await supabase
          .from("crm_members")
          .select("id, name, phone")
          .in("id", memberIds)
          .eq("center_id", ctx.centerId)
      : { data: [] };
    const memberMap = new Map((members ?? []).map((m) => [m.id, m]));
    const rows = Array.from(map.values())
      .map((v) => ({
        member_id: v.member_id,
        name: memberMap.get(v.member_id)?.name ?? "",
        phone: memberMap.get(v.member_id)?.phone ?? "",
        total_outstanding: v.total,
        items: v.items,
      }))
      .sort((a, b) => b.total_outstanding - a.total_outstanding);
    return NextResponse.json({ outstanding: rows });
  }

  let q = supabase
    .from("crm_payments")
    .select(
      "id, member_id, pass_id, membership_id, amount_won, method, method_custom, paid_at, note, status, created_at"
    )
    .eq("center_id", ctx.centerId)
    .order("paid_at", { ascending: false })
    .limit(200);

  if (memberId) q = q.eq("member_id", Number(memberId));
  if (passId) q = q.eq("pass_id", Number(passId));
  if (membershipId) q = q.eq("membership_id", Number(membershipId));

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ payments: data ?? [] });
}

/**
 * POST /api/crm/payments
 *
 * 결제 기록(추가 회수). 해당 수강권/회원권의 outstanding_won 을 차감하고
 * payment_status 를 paid/partial 로 갱신한다.
 *
 * Body: { pass_id?, membership_id?, amount_won, method, method_custom?, paid_at?, note? }
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  let body: {
    pass_id?: number;
    membership_id?: number;
    amount_won?: number;
    method?: string;
    method_custom?: string;
    paid_at?: string;
    note?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const passId = body.pass_id ? Number(body.pass_id) : null;
  const mbId = body.membership_id ? Number(body.membership_id) : null;
  if ((!passId && !mbId) || (passId && mbId)) {
    return NextResponse.json({ error: "수강권 또는 회원권 중 하나만 선택해 주세요" }, { status: 400 });
  }
  const amount = Math.floor(Number(body.amount_won) || 0);
  if (amount <= 0) {
    return NextResponse.json({ error: "결제 금액을 입력해 주세요" }, { status: 400 });
  }
  const method =
    body.method && METHODS.includes(body.method as (typeof METHODS)[number]) ? body.method : "cash";

  // 1) 대상 row 의 outstanding 확인 + 잠금 (member_id 도 같이 구함)
  const table = passId ? "crm_passes" : "crm_memberships";
  const targetId = (passId ?? mbId) as number;
  const { data: target, error: targetErr } = await supabase
    .from(table)
    .select("id, member_id, outstanding_won, price_won")
    .eq("id", targetId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (targetErr || !target) {
    return NextResponse.json({ error: "대상을 찾을 수 없습니다" }, { status: 404 });
  }
  if (amount > target.outstanding_won) {
    return NextResponse.json(
      { error: `미수금(${target.outstanding_won.toLocaleString("ko-KR")}원) 보다 큰 금액은 입력할 수 없습니다` },
      { status: 400 }
    );
  }

  // 2) payment 기록
  const { error: payErr } = await supabase.from("crm_payments").insert({
    center_id: ctx.centerId,
    member_id: target.member_id,
    pass_id: passId,
    membership_id: mbId,
    amount_won: amount,
    method,
    method_custom: body.method_custom?.trim() || null,
    paid_at: body.paid_at || new Date().toISOString(),
    recorded_by_uid: ctx.uid,
    note: body.note?.trim() || null,
    status: "completed",
  });
  if (payErr) {
    return NextResponse.json({ error: "결제 기록 실패", detail: payErr.message }, { status: 500 });
  }

  // 3) outstanding 차감 + payment_status 갱신
  const newOutstanding = target.outstanding_won - amount;
  const newStatus =
    newOutstanding <= 0 ? "paid" : newOutstanding < target.price_won ? "partial" : "unpaid";
  const { error: updErr } = await supabase
    .from(table)
    .update({ outstanding_won: newOutstanding, payment_status: newStatus } as never)
    .eq("id", targetId);
  if (updErr) {
    return NextResponse.json({ error: "상태 갱신 실패", detail: updErr.message }, { status: 500 });
  }

  // 4) 감사 로그
  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "payment.create",
    entity_type: passId ? "crm_passes" : "crm_memberships",
    entity_id: targetId,
    payload: { amount_won: amount, method, member_id: target.member_id } as never,
  });

  return NextResponse.json({ ok: true, outstanding_won: newOutstanding, payment_status: newStatus });
}
