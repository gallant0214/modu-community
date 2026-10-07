import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/pg/portone/webhook — 포트원(KG이니시스) 결제 알림.
 *
 * 토스 웹훅과 같은 원칙을 따른다:
 *   🚨 웹훅 본문을 믿지 않는다. 결제 id 만 꺼내 **포트원 서버에 직접 물어본 결과**로 판단한다.
 *   🚨 무슨 일이 있었는지 먼저 기록한다 — 사고를 되짚을 유일한 근거다.
 *   🚨 토스가 재시도하지 않도록 항상 200 으로 답하고, 사유는 로그에 남긴다.
 *      (포트원도 500 응답 시 최대 5회 재시도한다)
 *
 * 지금은 수신·기록까지만 한다. 발급·환불 반영은 채널 키를 받은 뒤 붙인다.
 */
export async function POST(request: Request) {
  const raw = await request.text();

  let body: Record<string, unknown> = {};
  try {
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }

  const data = (body.data ?? body) as Record<string, unknown>;
  const paymentId = String(data.paymentId ?? data.payment_id ?? "").trim();
  const eventType = String(body.type ?? body.eventType ?? "").trim();

  // 표준 웹훅 헤더 — 서명 검증에 쓴다(시크릿을 받은 뒤 활성화)
  const webhookId = request.headers.get("webhook-id") ?? "";
  const hasSignature = !!request.headers.get("webhook-signature");

  const { error } = await supabase.from("crm_pg_webhook_logs").insert({
    provider: "portone",
    event_type: eventType || null,
    order_uid: paymentId || null,
    payment_key: webhookId || null,
    handled: false,
    note: hasSignature
      ? "수신 기록(처리 로직 연결 전)"
      : "수신 기록 — 서명 헤더 없음(호출 테스트로 보임)",
    raw: (body as never) ?? null,
  } as never);

  if (error) {
    // 기록조차 못 하면 그건 알아야 한다. 다만 재시도를 부르지 않도록 200 으로 답한다.
    console.error("[portone] 웹훅 기록 실패", error.message);
  }

  return NextResponse.json({ ok: true });
}

/** 포트원 콘솔의 연결 확인용 */
export async function GET() {
  return NextResponse.json({ ok: true, provider: "portone" });
}
