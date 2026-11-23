import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { verifyOrderToken } from "@/app/lib/order-token";
import {
  centerOnnuriEnabled,
  claimOnnuri,
  loadOnnuriOrderByUid,
  startOnnuri,
  TEMP_ENTRY_DAYS,
} from "@/app/lib/crm-onnuri";

export const dynamic = "force-dynamic";

/**
 * 모바일 온누리 현장 결제 — 결제 화면(홈페이지·회원앱·QR 셀프가입 공용)에서 부른다.
 * 인증은 결제 링크에 붙은 주문 토큰(t). 금액은 주문에 저장된 값만 쓴다.
 *
 * POST { orderUid, t, action: "start" | "claim" }
 *   start : 결제수단으로 온누리 선택
 *   claim : '결제했어요' — 확인 전까지 임시 입장
 * GET ?orderUid=&t=  → 진행 상태 (화면이 몇 초마다 확인)
 */
async function load(orderUid: string | null, t: string | null) {
  if (!orderUid || !verifyOrderToken(t, orderUid)) return { error: "결제 링크가 만료됐어요", status: 401 } as const;
  const order = await loadOnnuriOrderByUid(orderUid);
  if (!order) return { error: "주문을 찾을 수 없어요", status: 404 } as const;
  return { order } as const;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const r = await load(url.searchParams.get("orderUid"), url.searchParams.get("t"));
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const o = r.order;
  return NextResponse.json({
    status: o.status,
    state: o.onnuri_state,
    amountWon: o.amount_won,
    productName: o.product_name,
    paid: o.status === "paid",
    tempEntryDays: TEMP_ENTRY_DAYS,
  });
}

export async function POST(request: Request) {
  let body: { orderUid?: string; t?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const r = await load(body.orderUid ?? null, body.t ?? null);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const order = r.order;

  if (!(await centerOnnuriEnabled(order.center_id))) {
    return NextResponse.json({ error: "이 센터는 아직 온누리 결제를 받지 않아요" }, { status: 400 });
  }

  if (body.action === "start") {
    const res = await startOnnuri(order);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ ok: true, amountWon: order.amount_won });
  }

  if (body.action === "claim") {
    const res = await claimOnnuri(order);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    await supabase.from("crm_audit_logs").insert({
      center_id: order.center_id,
      actor_uid: `member:${order.member_id}`,
      action: "onnuri.claim",
      entity_type: "crm_orders",
      entity_id: order.id,
      payload: { amount_won: order.amount_won, matched: !!res.matched } as never,
    });
    return NextResponse.json({ ok: true, matched: !!res.matched });
  }

  return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
}
