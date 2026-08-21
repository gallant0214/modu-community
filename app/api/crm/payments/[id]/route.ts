import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

const METHODS = ["cash", "card", "transfer", "etc"] as const;

/**
 * PATCH /api/crm/payments/[id]  — 결제내역 항목 수정 (금액/수단/결제일/메모/상태)
 * DELETE /api/crm/payments/[id] — 결제내역 항목 삭제
 * 권한: 수정=sales.edit, 삭제=sales.delete. (센터 격리)
 * 주의: 연결된 수강권/회원권의 미수금(outstanding)은 자동 재계산하지 않음(기록만 관리).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  const perms = await loadPermissionsForContext(ctx);

  const { id } = await params;
  const paymentId = Number(id) || 0;
  if (!paymentId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  let body: {
    amount_won?: number;
    method?: string;
    method_custom?: string | null;
    paid_at?: string;
    note?: string | null;
    status?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  // 권한 분기: 상태 변경(환불/취소)은 sales.refund, 그 외 필드 수정은 sales.edit
  const changingFields =
    body.amount_won !== undefined ||
    body.method !== undefined ||
    body.method_custom !== undefined ||
    body.paid_at !== undefined ||
    body.note !== undefined;
  const changingStatus = body.status !== undefined;
  if (changingFields && !perms["sales.edit"]) {
    return NextResponse.json({ error: "결제내역 수정 권한이 없습니다" }, { status: 403 });
  }
  if (changingStatus && !perms["sales.refund"] && !perms["sales.edit"]) {
    return NextResponse.json({ error: "환불 권한이 없습니다" }, { status: 403 });
  }

  const { data: cur } = await supabase
    .from("crm_payments")
    .select("id")
    .eq("id", paymentId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!cur) return NextResponse.json({ error: "결제내역을 찾을 수 없어요" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (body.amount_won !== undefined) {
    const n = Math.trunc(Number(body.amount_won));
    if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: "금액이 올바르지 않아요" }, { status: 400 });
    patch.amount_won = n;
  }
  if (body.method !== undefined) {
    if (!METHODS.includes(body.method as (typeof METHODS)[number])) {
      return NextResponse.json({ error: "결제 수단이 올바르지 않아요" }, { status: 400 });
    }
    patch.method = body.method;
    patch.method_custom = body.method === "etc" ? (body.method_custom?.trim() || null) : null;
  } else if (body.method_custom !== undefined) {
    patch.method_custom = body.method_custom?.trim() || null;
  }
  if (body.paid_at !== undefined && body.paid_at) {
    // 'YYYY-MM-DD' 면 KST 정오로 저장, 그 외(ISO)는 그대로.
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(body.paid_at)
      ? new Date(`${body.paid_at}T12:00:00+09:00`).toISOString()
      : new Date(body.paid_at).toISOString();
    patch.paid_at = iso;
  }
  if (body.note !== undefined) patch.note = body.note?.trim() || null;
  if (body.status !== undefined) patch.status = body.status;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase
    .from("crm_payments")
    .update(patch as never)
    .eq("id", paymentId)
    .eq("center_id", ctx.centerId);
  if (error) return NextResponse.json({ error: "수정 실패", detail: error.message }, { status: 500 });

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "payment.update",
    entity_type: "crm_payments",
    entity_id: paymentId,
    payload: patch as never,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  const perms = await loadPermissionsForContext(ctx);
  if (!perms["sales.delete"]) {
    return NextResponse.json({ error: "결제내역 삭제 권한이 없습니다" }, { status: 403 });
  }

  const { id } = await params;
  const paymentId = Number(id) || 0;
  if (!paymentId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { data: cur } = await supabase
    .from("crm_payments")
    .select("id, member_id, pass_id, membership_id")
    .eq("id", paymentId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!cur) return NextResponse.json({ error: "결제내역을 찾을 수 없어요" }, { status: 404 });

  const memberId = (cur as { member_id: number | null }).member_id ?? null;
  const membershipId = (cur as { membership_id: number | null }).membership_id ?? null;
  const passId = (cur as { pass_id: number | null }).pass_id ?? null;

  // 구매 취소 = 결제 + 연결 상품 + 같은 구매(동일 트랜잭션)의 묶음 구성까지 삭제.
  // 트랜잭션 시각 = 연결된 회원권/수강권의 created_at. (결제만 있고 상품 링크가 없으면 결제만 삭제)
  let txAt: string | null = null;
  if (membershipId) {
    const { data } = await supabase
      .from("crm_memberships")
      .select("created_at")
      .eq("id", membershipId)
      .eq("center_id", ctx.centerId)
      .maybeSingle();
    txAt = (data as { created_at: string } | null)?.created_at ?? null;
  } else if (passId) {
    const { data } = await supabase
      .from("crm_passes")
      .select("created_at")
      .eq("id", passId)
      .eq("center_id", ctx.centerId)
      .maybeSingle();
    txAt = (data as { created_at: string } | null)?.created_at ?? null;
  }

  const removed = { memberships: 0, passes: 0, rentals: 0, lockers_returned: 0, lockers_reverted: 0 };

  if (txAt && memberId) {
    // 동일 트랜잭션 판정: created_at ±3초
    const lo = new Date(Date.parse(txAt) - 3000).toISOString();
    const hi = new Date(Date.parse(txAt) + 3000).toISOString();

    const [msRes, psRes, rsRes, lhRes] = await Promise.all([
      supabase.from("crm_memberships").select("id").eq("center_id", ctx.centerId).eq("member_id", memberId).gte("created_at", lo).lte("created_at", hi),
      supabase.from("crm_passes").select("id").eq("center_id", ctx.centerId).eq("member_id", memberId).gte("created_at", lo).lte("created_at", hi),
      supabase.from("crm_rentals").select("id").eq("center_id", ctx.centerId).eq("member_id", memberId).gte("created_at", lo).lte("created_at", hi),
      supabase.from("crm_locker_history").select("locker_id, created_at").eq("center_id", ctx.centerId).eq("member_id", memberId).eq("action", "assign").gte("created_at", lo).lte("created_at", hi),
    ]);

    // 락커: 이 구매로 배정/연장된 락커를 이전 상태로 되돌리거나 회수
    const lockerHist = (lhRes.data ?? []) as { locker_id: number; created_at: string }[];
    const lockerIds = Array.from(new Set(lockerHist.map((h) => h.locker_id)));
    const nowIso = new Date().toISOString();
    for (const lid of lockerIds) {
      const thisAssign = lockerHist
        .filter((h) => h.locker_id === lid)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
      if (!thisAssign) continue;
      // 이 구매 assign 직전 이력
      const { data: prev } = await supabase
        .from("crm_locker_history")
        .select("action, start_date, expires_at")
        .eq("locker_id", lid)
        .lt("created_at", thisAssign.created_at)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: lk } = await supabase
        .from("crm_lockers")
        .select("zone_id, number")
        .eq("id", lid)
        .eq("center_id", ctx.centerId)
        .maybeSingle();
      const prevRow = prev as { action: string; start_date: string | null; expires_at: string | null } | null;
      if (prevRow && prevRow.action === "assign") {
        // 기존 락커 연장분 → 이전 기간으로 원복
        await supabase
          .from("crm_lockers")
          .update({ start_date: prevRow.start_date, expires_at: prevRow.expires_at, updated_at: nowIso } as never)
          .eq("id", lid)
          .eq("center_id", ctx.centerId);
        if (lk) {
          await supabase.from("crm_locker_history").insert({
            center_id: ctx.centerId,
            locker_id: lid,
            zone_id: (lk as { zone_id: number }).zone_id,
            number: (lk as { number: number }).number,
            action: "update",
            member_id: memberId,
            start_date: prevRow.start_date,
            expires_at: prevRow.expires_at,
            actor_uid: ctx.uid,
          } as never);
        }
        removed.lockers_reverted++;
      } else {
        // 이 구매로 새로 배정된 락커 → 회수(미배정)
        await supabase
          .from("crm_lockers")
          .update({ state: "unassigned", assigned_member_id: null, start_date: null, expires_at: null, password: null, memo: null, updated_at: nowIso } as never)
          .eq("id", lid)
          .eq("center_id", ctx.centerId);
        if (lk) {
          await supabase.from("crm_locker_history").insert({
            center_id: ctx.centerId,
            locker_id: lid,
            zone_id: (lk as { zone_id: number }).zone_id,
            number: (lk as { number: number }).number,
            action: "return",
            member_id: memberId,
            actor_uid: ctx.uid,
          } as never);
        }
        removed.lockers_returned++;
      }
    }

    // 상품 삭제 (회원권/수강권 삭제 시 연결 결제·예약은 FK CASCADE 로 함께 삭제)
    const msIds = (msRes.data ?? []).map((m) => (m as { id: number }).id);
    const psIds = (psRes.data ?? []).map((p) => (p as { id: number }).id);
    const rsIds = (rsRes.data ?? []).map((r) => (r as { id: number }).id);
    if (msIds.length) {
      await supabase.from("crm_memberships").delete().in("id", msIds).eq("center_id", ctx.centerId);
      removed.memberships = msIds.length;
    }
    if (psIds.length) {
      await supabase.from("crm_passes").delete().in("id", psIds).eq("center_id", ctx.centerId);
      removed.passes = psIds.length;
    }
    if (rsIds.length) {
      await supabase.from("crm_rentals").delete().in("id", rsIds).eq("center_id", ctx.centerId);
      removed.rentals = rsIds.length;
    }
  }

  // 결제 레코드 삭제 (상품 CASCADE 로 이미 지워졌으면 no-op)
  const { error } = await supabase
    .from("crm_payments")
    .delete()
    .eq("id", paymentId)
    .eq("center_id", ctx.centerId);
  if (error) return NextResponse.json({ error: "삭제 실패", detail: error.message }, { status: 500 });

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "payment.delete",
    entity_type: "crm_payments",
    entity_id: paymentId,
    payload: removed as never,
  });
  return NextResponse.json({ ok: true, removed });
}
