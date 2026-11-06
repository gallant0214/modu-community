import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/app/lib/cron-auth";
import { checkPushHealth, summarizeFailure } from "@/app/lib/push-health";
import { solapiConfigured, solapiSend } from "@/app/lib/solapi";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/cron/push-health  (매일 09:05 KST)
 * iOS(APNs)·Android(FCM) 푸시 발송 경로를 비파괴로 점검한다. 사용자에게는 아무것도 가지 않는다.
 *
 * 인증 두 갈래:
 *   - 크론(CRON_SECRET — isCronAuthorized): 점검 + **실패 시 운영자(OPS_ALERT_PHONE)에게 문자**
 *   - 수동(Authorization: Bearer PUSH_HEALTH_TOKEN): 점검 결과만 반환(문자 없음).
 *     키·환경변수를 바꾼 직후 바로 확인하는 용도.
 *
 * 🚨 2026-11-03: 무효 APNs 키로 iOS 푸시가 11일간 조용히 실패한 사고의 재발 방지 장치.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const healthToken = process.env.PUSH_HEALTH_TOKEN;
  const isCron = isCronAuthorized(req);
  const isManual = !!healthToken && auth === `Bearer ${healthToken}`;
  if (!isCron && !isManual) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const health = await checkPushHealth();

  let alerted = false;
  if (!health.ok) {
    const summary = summarizeFailure(health);
    console.error("[push-health] 푸시 점검 실패:", summary);
    const phone = process.env.OPS_ALERT_PHONE;
    if (isCron && phone && solapiConfigured()) {
      const r = await solapiSend({
        receivers: [phone],
        subject: "푸시 점검 실패",
        msg:
          `[모두의지도사] 폰 푸시 발송 점검 실패\n${summary}\n` +
          `앱 알림함엔 쌓이지만 폰 알림이 안 가는 상태입니다. Vercel APNS_*/FIREBASE 환경변수를 확인하세요.`,
      }).catch(() => null);
      alerted = !!r?.ok;
    }
  }

  return NextResponse.json({ ...health, mode: isCron ? "cron" : "manual", alerted });
}
