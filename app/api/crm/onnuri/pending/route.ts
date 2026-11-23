import { NextResponse } from "next/server";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { listOnnuriCancels, listPendingOnnuri } from "@/app/lib/crm-onnuri";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/onnuri/pending — 확인이 필요한 온누리 결제 (배너·승인 화면용).
 * 권한(sales.onnuri_confirm)이 없으면 403 대신 빈 목록 — 배너는 조용히 숨으면 된다.
 * ?all=1 이면 10분이 안 지난 건(자동 대조 대기)까지 포함.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "sales.onnuri_confirm"))) {
    return NextResponse.json({ items: [], cancels: [], allowed: false });
  }
  const all = new URL(request.url).searchParams.get("all") === "1";
  const [items, cancels] = await Promise.all([listPendingOnnuri(ctx.centerId), listOnnuriCancels(ctx.centerId)]);
  // 취소 알림은 기다릴 이유가 없다 — 직원이 가맹점 앱에서 직접 취소한 것이라 바로 보여준다
  return NextResponse.json({ items: all ? items : items.filter((i) => i.overdue), cancels, allowed: true });
}
