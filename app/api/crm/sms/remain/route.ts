import { NextResponse } from "next/server";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";
import { aligoConfigured, aligoRemain } from "@/app/lib/aligo";

export const dynamic = "force-dynamic";

/** GET /api/crm/sms/remain — 발송 가능 잔여 건수(SMS/LMS/MMS) */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  const perms = await loadPermissionsForContext(ctx);
  if (perms["messages.send"] === false) {
    return NextResponse.json({ error: "메세지 전송 권한이 없습니다" }, { status: 403 });
  }
  if (!aligoConfigured()) {
    return NextResponse.json({ configured: false }, { status: 200 });
  }
  const r = await aligoRemain();
  if (!r.ok) {
    return NextResponse.json({ configured: true, ok: false, message: r.message }, { status: 200 });
  }
  return NextResponse.json({
    configured: true,
    ok: true,
    sms: r.SMS_CNT ?? 0,
    lms: r.LMS_CNT ?? 0,
    mms: r.MMS_CNT ?? 0,
  });
}
