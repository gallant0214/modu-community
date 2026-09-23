import { NextResponse } from "next/server";
import { expireStaleOrders } from "@/app/lib/member-checkout";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/crm-order-expire — 10분마다 실행(vercel.json).
 *
 * 결제창까지 갔다가 이탈한 주문(pending)을 시한이 지나면 정리한다.
 * 정리의 진짜 목적은 **잡아둔 쿠폰을 회원에게 돌려주는 것** — 안 풀어주면
 * 결제도 안 됐는데 쿠폰이 '사용 완료'로 묶인 채 남는다.
 *
 * 마일리지는 승인 시점에만 차감하므로 여기서 되돌릴 게 없다(선점만 풀린다).
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const expired = await expireStaleOrders({ limit: 500 });
  return NextResponse.json({ ok: true, expired });
}
