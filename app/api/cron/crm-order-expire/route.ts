import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/app/lib/cron-auth";
import { expireStaleOrders } from "@/app/lib/member-checkout";
import { alertOverdueOnnuri } from "@/app/lib/crm-onnuri";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/crm-order-expire — 10분마다 실행(vercel.json).
 *
 * 결제창까지 갔다가 이탈한 주문(pending)을 시한이 지나면 정리한다.
 * 정리의 진짜 목적은 **잡아둔 쿠폰을 회원에게 돌려주는 것** — 안 풀어주면
 * 결제도 안 됐는데 쿠폰이 '사용 완료'로 묶인 채 남는다.
 *
 * 마일리지는 승인 시점에만 차감하므로 여기서 되돌릴 게 없다(선점만 풀린다).
 *
 * + 모바일 온누리: 10분 안에 자동으로 못 맞춘 결제를 권한 직원에게 알린다(강사앱 푸시).
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const expired = await expireStaleOrders({ limit: 500 });
  let onnuriAlerted = 0;
  try {
    onnuriAlerted = await alertOverdueOnnuri();
  } catch (e) {
    console.error("[cron] onnuri alert error", e);
  }
  return NextResponse.json({ ok: true, expired, onnuriAlerted });
}
