import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { signOrderToken } from "@/app/lib/order-token";
import { defaultPlan, findPlan } from "@/app/lib/saas-plans";
import {
  saasSalesAllowedForUid,
  SAAS_SALES_DISABLED_MESSAGE,
  currentSubscription,
} from "@/app/lib/saas-subscription";
import {
  expireStaleSaasOrders,
  saasOrderExpiresAt,
  SAAS_ORDER_SELECT,
  type SaasOrderRow,
} from "@/app/lib/saas-order-complete";

export const dynamic = "force-dynamic";

/**
 * POST /api/saas/orders  { centerId, planCode? }
 *
 * 센터 CRM 이용권 주문을 만든다. 금액은 **서버가 요금제 상수에서 가져온다** —
 * 클라이언트가 보낸 금액은 어디서도 쓰지 않는다.
 *
 * 🚨 센터 이용권 주문(`/api/crm/member-app/orders`)과 전혀 다른 건이다.
 *    저쪽은 "센터가 자기 회원에게" 파는 것이고 이쪽은 "우리가 사장님에게" 판다.
 *    판매 스위치도 따로다 — `onlineSalesEnabled()` 를 보지 않는다.
 */
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  let body: { centerId?: number; planCode?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (!saasSalesAllowedForUid(user.uid)) {
    return NextResponse.json({ error: SAAS_SALES_DISABLED_MESSAGE }, { status: 503 });
  }

  const centerId = Number(body.centerId);
  if (!Number.isFinite(centerId) || centerId <= 0) {
    return NextResponse.json({ error: "센터를 선택해주세요" }, { status: 400 });
  }

  const plan = body.planCode ? findPlan(body.planCode) : defaultPlan();
  if (!plan) {
    return NextResponse.json({ error: "판매 중인 요금제가 아니에요" }, { status: 400 });
  }

  /* 🚨 이 센터의 **대표자만** 결제할 수 있다. 강사가 자기 센터 이용권을 결제하면
     누가 낸 돈인지, 누구에게 환불할지가 흐려진다. */
  const { data: memRow } = await supabase
    .from("crm_center_members")
    .select("id, role, is_solo_owner, status")
    .eq("center_id", centerId)
    .eq("firebase_uid", user.uid)
    .eq("status", "active")
    .maybeSingle();
  const mem = memRow as { role: string; is_solo_owner: boolean } | null;
  if (!mem || !(mem.role === "owner" || mem.is_solo_owner)) {
    return NextResponse.json(
      { error: "센터 대표자만 이용권을 결제할 수 있어요" },
      { status: 403 }
    );
  }

  const { data: centerRow } = await supabase
    .from("crm_centers")
    .select("name, status")
    .eq("id", centerId)
    .maybeSingle();
  const center = centerRow as { name: string; status: string } | null;
  if (!center || center.status !== "active") {
    return NextResponse.json({ error: "이용할 수 없는 센터예요" }, { status: 400 });
  }

  /* 🚨 시한 지난 pending 주문을 먼저 치운다. 센터당 pending 주문을 1개로 묶는
     유니크 인덱스가 있어서, 결제창을 열고 닫아버린 주문 하나가 남아 있으면
     재구매가 영구히 막힌다. */
  await expireStaleSaasOrders({ centerId });

  // 이미 살아있는 주문이 있으면 새로 만들지 않고 그걸 다시 내려준다
  const { data: liveRow } = await supabase
    .from("saas_orders")
    .select(SAAS_ORDER_SELECT)
    .eq("center_id", centerId)
    .in("status", ["pending", "processing"])
    .maybeSingle();
  const live = liveRow as unknown as SaasOrderRow | null;
  if (live) {
    return NextResponse.json({
      orderUid: live.order_uid,
      amount: live.amount_won,
      planName: live.plan_name,
      reused: true,
      payUrl: `/billing/pay/${live.order_uid}?t=${signOrderToken(live.order_uid)}`,
    });
  }

  const rand = Math.random().toString(36).slice(2, 8);
  // 🚨 'sa_' 접두사로 센터 이용권 주문('mo_')과 구분한다 — 웹훅이 이걸로 가른다
  const orderUid = `sa_${centerId}_${Date.now().toString(36)}_${rand}`;

  const { data: inserted, error } = await supabase
    .from("saas_orders")
    .insert({
      order_uid: orderUid,
      firebase_uid: user.uid,
      center_id: centerId,
      plan_code: plan.code,
      plan_name: plan.name,
      period_months: plan.periodMonths,
      amount_won: plan.priceWon,
      status: "pending",
      expires_at: saasOrderExpiresAt(),
      pg_provider: "portone",
    } as never)
    .select(SAAS_ORDER_SELECT)
    .single();

  if (error || !inserted) {
    return NextResponse.json(
      { error: "주문을 만들지 못했어요", detail: error?.message },
      { status: 500 }
    );
  }

  const sub = await currentSubscription(centerId);
  return NextResponse.json({
    orderUid,
    amount: plan.priceWon,
    planName: plan.name,
    centerName: center.name,
    /** 현재 만료일 — 결제하면 이 다음 날부터 이어진다 */
    currentExpiresOn: sub?.expires_on ?? null,
    payUrl: `/billing/pay/${orderUid}?t=${signOrderToken(orderUid)}`,
  });
}
