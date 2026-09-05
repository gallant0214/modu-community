import { NextResponse, after } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";
import { notifyCenterStaffSignupPurchase } from "@/app/lib/crm-staff-notify";

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
    .select("id, member_id, pass_id, membership_id, rental_id, amount_won")
    .eq("id", paymentId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!cur) return NextResponse.json({ error: "결제내역을 찾을 수 없어요" }, { status: 404 });

  const memberId = (cur as { member_id: number | null }).member_id ?? null;
  const membershipId = (cur as { membership_id: number | null }).membership_id ?? null;
  const passId = (cur as { pass_id: number | null }).pass_id ?? null;
  const rentalId = (cur as { rental_id: number | null }).rental_id ?? null;
  const refundAmount = (cur as { amount_won: number | null }).amount_won ?? 0;

  // 이 결제에 연결된 '단일 상품'만 삭제. 묶음(장바구니) 결제라도 각 상품이 각자 결제행이므로
  // 한 결제내역을 지우면 그 상품 하나만 삭제된다. (락커 대여권일 때만 해당 락커 원복)
  const removed = {
    counts: { memberships: 0, passes: 0, rentals: 0, lockers_returned: 0, lockers_reverted: 0 },
    memberships: [] as unknown[],
    passes: [] as unknown[],
    rentals: [] as unknown[],
    lockers: [] as unknown[],
  };
  const nowIso = new Date().toISOString();

  // 락커 대여권 삭제 시: 이 구매(±3초)로 배정/연장된 락커만 원복
  if (rentalId && memberId) {
    const { data: rentalInfo } = await supabase
      .from("crm_rentals")
      .select("created_at, item_name, memo")
      .eq("id", rentalId)
      .eq("center_id", ctx.centerId)
      .maybeSingle();
    const ri = rentalInfo as { created_at: string; item_name: string | null; memo: string | null } | null;
    const isLockerRental =
      !!ri &&
      ((ri.memo ?? "").includes("미배정") ||
        /\d+번/.test(ri.memo ?? "") ||
        (ri.memo ?? "").includes("락커") ||
        /^(락커|상가)/.test((ri.item_name ?? "").trim()));
    if (isLockerRental && ri) {
      const lo = new Date(Date.parse(ri.created_at) - 3000).toISOString();
      const hi = new Date(Date.parse(ri.created_at) + 3000).toISOString();
      const { data: lhData } = await supabase
        .from("crm_locker_history")
        .select("locker_id, created_at")
        .eq("center_id", ctx.centerId)
        .eq("member_id", memberId)
        .eq("action", "assign")
        .gte("created_at", lo)
        .lte("created_at", hi);
      const lockerHist = (lhData ?? []) as { locker_id: number; created_at: string }[];
      const lockerIds = Array.from(new Set(lockerHist.map((h) => h.locker_id)));
      for (const lid of lockerIds) {
        const thisAssign = lockerHist
          .filter((h) => h.locker_id === lid)
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
        if (!thisAssign) continue;
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
          await supabase
            .from("crm_lockers")
            .update({ start_date: prevRow.start_date, expires_at: prevRow.expires_at, updated_at: nowIso } as never)
            .eq("id", lid)
            .eq("center_id", ctx.centerId);
          if (lk) {
            await supabase.from("crm_locker_history").insert({
              center_id: ctx.centerId, locker_id: lid,
              zone_id: (lk as { zone_id: number }).zone_id, number: (lk as { number: number }).number,
              action: "update", member_id: memberId,
              start_date: prevRow.start_date, expires_at: prevRow.expires_at, actor_uid: ctx.uid,
            } as never);
          }
          removed.counts.lockers_reverted++;
          removed.lockers.push({ id: lid, action: "reverted" });
        } else {
          await supabase
            .from("crm_lockers")
            .update({ state: "unassigned", assigned_member_id: null, start_date: null, expires_at: null, password: null, memo: null, updated_at: nowIso } as never)
            .eq("id", lid)
            .eq("center_id", ctx.centerId);
          if (lk) {
            await supabase.from("crm_locker_history").insert({
              center_id: ctx.centerId, locker_id: lid,
              zone_id: (lk as { zone_id: number }).zone_id, number: (lk as { number: number }).number,
              action: "return", member_id: memberId, actor_uid: ctx.uid,
            } as never);
          }
          removed.counts.lockers_returned++;
          removed.lockers.push({ id: lid, action: "returned" });
        }
      }
    }
  }

  // 단일 상품 삭제 (연결 결제·예약은 FK CASCADE 로 함께 삭제)
  if (membershipId) {
    await supabase.from("crm_memberships").delete().eq("id", membershipId).eq("center_id", ctx.centerId);
    removed.counts.memberships = 1;
  } else if (passId) {
    await supabase.from("crm_passes").delete().eq("id", passId).eq("center_id", ctx.centerId);
    removed.counts.passes = 1;
  } else if (rentalId) {
    await supabase.from("crm_rentals").delete().eq("id", rentalId).eq("center_id", ctx.centerId);
    removed.counts.rentals = 1;
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

  // 가입 및 등록 알림 — 구매취소(환불). 상품 유형 라벨 + 환불 금액.
  if (memberId) {
    const refundProduct = membershipId ? "회원권" : passId ? "수강권" : rentalId ? "대여권" : "상품";
    after(() =>
      notifyCenterStaffSignupPurchase({
        centerId: ctx.centerId,
        kind: "refund",
        memberId,
        productName: refundProduct,
        amountWon: refundAmount,
      })
    );
  }
  return NextResponse.json({ ok: true, removed });
}
