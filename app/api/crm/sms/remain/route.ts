import { NextResponse } from "next/server";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";
import { solapiConfigured, solapiBalance, solapiPricing } from "@/app/lib/solapi";

export const dynamic = "force-dynamic";

/** GET /api/crm/sms/remain — 솔라피 잔액(캐시/포인트) + 발송 단가 조회 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  // 문자 발송은 스페셜바디(center 1) 전용
  if (ctx.centerId !== 1) {
    return NextResponse.json({ error: "현재 잠금 기능입니다." }, { status: 403 });
  }
  const perms = await loadPermissionsForContext(ctx);
  if (perms["messages.send"] === false) {
    return NextResponse.json({ error: "메세지 전송 권한이 없습니다" }, { status: 403 });
  }
  if (!solapiConfigured()) {
    return NextResponse.json({ configured: false }, { status: 200 });
  }
  const sender = (process.env.SOLAPI_SENDER ?? "").replace(/\D/g, "");
  const [r, pricing] = await Promise.all([solapiBalance(), solapiPricing()]);
  if (!r.ok) {
    return NextResponse.json({ configured: true, ok: false, message: r.message, sender }, { status: 200 });
  }
  return NextResponse.json({
    configured: true,
    ok: true,
    balance: r.balance,
    point: r.point,
    sender,
    // 예상 지출 금액 계산용 실제 단가(원/건). 조회 실패 시 null → 화면에서 금액 숨김
    pricing,
  });
}
