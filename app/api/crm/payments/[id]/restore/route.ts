import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/payments/[id]/restore — 환불 처리 **복원**(환불 취소).
 *
 * 잘못 환불한 건을 되돌린다.
 *   1) 환불 이력(crm_payment_refunds) 삭제
 *   2) 결제행 status: refunded → completed
 *   3) 연결 상품(회원권·수강권·대여권) status: refunded → valid
 *   4) 활동로그 payment.restore 기록
 *
 * 🚨 자동으로 되돌리지 않는 것 (화면에서 안내 후 직원이 처리):
 *   - 환불 시 정산한 마일리지 (돌려준 사용분·회수한 적립분) — 이중 정산 위험
 *   - 환불로 돌려준 쿠폰 / 회수된 락커 배정
 *   - 온라인(토스) 결제는 애초에 CRM 에서 환불할 수 없으므로 복원 대상도 아니다.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const perms = await loadPermissionsForContext(ctx);
  if (!perms["sales.refund"] && !perms["sales.edit"]) {
    return NextResponse.json({ error: "환불 복원 권한이 없습니다" }, { status: 403 });
  }

  const { id } = await params;
  const paymentId = Number(id) || 0;
  if (!paymentId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { data: before } = await supabase
    .from("crm_payments")
    .select("id, member_id, status, amount_won, order_id, membership_id, pass_id, rental_id")
    .eq("id", paymentId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "결제내역을 찾을 수 없어요" }, { status: 404 });

  const row = before as {
    id: number;
    member_id: number | null;
    status: string;
    amount_won: number | null;
    order_id: number | null;
    membership_id: number | null;
    pass_id: number | null;
    rental_id: number | null;
  };

  if (row.status !== "refunded") {
    return NextResponse.json({ error: "환불된 결제만 복원할 수 있어요" }, { status: 400 });
  }
  if (row.order_id) {
    return NextResponse.json(
      {
        error:
          "온라인(토스) 결제는 여기서 복원할 수 없어요. 토스 결제 상태가 원장의 기준이라 토스에서 처리해야 합니다.",
      },
      { status: 409 }
    );
  }

  // 1) 환불 이력 삭제 (금액은 로그에 남긴다)
  const { data: refunds } = await supabase
    .from("crm_payment_refunds")
    .select("id, amount_won")
    .eq("center_id", ctx.centerId)
    .eq("payment_id", row.id);
  const refundedWon = ((refunds ?? []) as { amount_won: number | null }[]).reduce(
    (s, r) => s + (r.amount_won ?? 0),
    0
  );
  if ((refunds ?? []).length > 0) {
    const { error: delErr } = await supabase
      .from("crm_payment_refunds")
      .delete()
      .eq("center_id", ctx.centerId)
      .eq("payment_id", row.id);
    if (delErr) {
      return NextResponse.json({ error: "환불 이력 삭제 실패", detail: delErr.message }, { status: 500 });
    }
  }

  // 2) 결제행 복원
  const { error: payErr } = await supabase
    .from("crm_payments")
    .update({ status: "completed", updated_at: new Date().toISOString() } as never)
    .eq("id", row.id)
    .eq("center_id", ctx.centerId);
  if (payErr) {
    return NextResponse.json({ error: "결제 복원 실패", detail: payErr.message }, { status: 500 });
  }

  // 3) 연결 상품 복원 (refunded 인 것만 — 다른 이유로 만료된 건 건드리지 않는다)
  let restoredProduct: { kind: string; id: number } | null = null;
  const productTargets: { kind: "membership" | "pass" | "rental"; table: string; id: number | null }[] = [
    { kind: "membership", table: "crm_memberships", id: row.membership_id },
    { kind: "pass", table: "crm_passes", id: row.pass_id },
    { kind: "rental", table: "crm_rentals", id: row.rental_id },
  ];
  for (const t of productTargets) {
    if (!t.id) continue;
    const { data: updated } = await supabase
      .from(t.table as "crm_memberships")
      .update({ status: "valid", updated_at: new Date().toISOString() } as never)
      .eq("id", t.id)
      .eq("center_id", ctx.centerId)
      .eq("status", "refunded")
      .select("id");
    if ((updated ?? []).length > 0) restoredProduct = { kind: t.kind, id: t.id };
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "payment.restore",
    entity_type: "crm_payments",
    entity_id: row.id,
    payload: {
      member_id: row.member_id,
      결제금액: row.amount_won ?? 0,
      삭제한환불이력: (refunds ?? []).length,
      환불금액: refundedWon,
      복원상품: restoredProduct ? `${restoredProduct.kind}#${restoredProduct.id}` : null,
      note: "마일리지·쿠폰·락커 배정은 자동 복원하지 않음",
    } as never,
  });

  return NextResponse.json({
    ok: true,
    restored_product: restoredProduct,
    refunded_won: refundedWon,
  });
}
