/**
 * 푸시 발송 경로 상태 점검(비파괴) — 실제 사용자에게는 아무것도 보내지 않는다.
 *
 * 🚨 왜 필요한가 (2026-11-03 사고):
 *    Vercel 에 무효 APNs 키(59D9F68G72)가 들어가 iOS 폰 푸시가 11일간 조용히 실패했다.
 *    앱 안 알림함에는 기록이 남아 아무도 몰랐다. 또 구버전 Vercel CLI 로 넣은 환경변수는
 *    값이 비어 저장되기도 했다. → '배포된 설정' 자체를 매일 검사하고, 실패하면 운영자에게 문자.
 *
 *  - APNs: 회원(com.moduji.member)·강사(com.moduji.trainer) 번들 각각 가짜 토큰으로 인증 확인
 *  - FCM : 최근 Android 토큰 1개로 dryRun(발송 안 함) → 서비스계정 자격증명 확인
 */
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { supabase } from "./supabase";
import { probeApnsAuth, type ApnsProbe } from "./apns";

export type FcmProbe = { ok: boolean; reason: string };

export type PushHealth = {
  ok: boolean;
  apns: { member: ApnsProbe; trainer: ApnsProbe };
  fcm: FcmProbe;
  checkedAt: string;
};

/** 토큰 자체의 문제(만료 등)는 자격증명이 정상이라는 뜻 — 경로 점검에선 통과로 본다 */
const FCM_TOKEN_LEVEL_ERRORS = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

function adminApp() {
  if (getApps().length === 0) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (sa) initializeApp({ credential: cert(JSON.parse(sa)) });
    else initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || "moducm-f2edf" });
  }
  return getApps()[0];
}

async function probeFcm(): Promise<FcmProbe> {
  try {
    const { data } = await supabase
      .from("crm_member_device_tokens")
      .select("token")
      .eq("platform", "android")
      .order("updated_at", { ascending: false })
      .limit(1);
    const token = (data?.[0] as { token?: string } | undefined)?.token;
    if (!token) return { ok: true, reason: "Skipped (Android 토큰 없음)" };

    const res = await getMessaging(adminApp()).sendEachForMulticast(
      { notification: { title: "health", body: "health" }, tokens: [token] },
      true // dryRun — 실제 발송 안 함
    );
    const r = res.responses[0];
    if (r?.success) return { ok: true, reason: "OK" };
    const code = (r?.error as { code?: string } | undefined)?.code ?? "unknown";
    if (FCM_TOKEN_LEVEL_ERRORS.has(code)) return { ok: true, reason: `OK (토큰만 만료: ${code})` };
    return { ok: false, reason: code };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "unknown" };
  }
}

export async function checkPushHealth(): Promise<PushHealth> {
  const [member, trainer, fcm] = await Promise.all([
    probeApnsAuth("com.moduji.member"),
    probeApnsAuth("com.moduji.trainer"),
    probeFcm(),
  ]);
  return {
    ok: member.ok && trainer.ok && fcm.ok,
    apns: { member, trainer },
    fcm,
    checkedAt: new Date().toISOString(),
  };
}

/** 실패 내용을 문자 한 통 분량으로 요약 */
export function summarizeFailure(h: PushHealth): string {
  const parts: string[] = [];
  if (!h.apns.member.ok) parts.push(`iOS 회원앱 APNs: ${h.apns.member.reason}`);
  if (!h.apns.trainer.ok) parts.push(`iOS 강사앱 APNs: ${h.apns.trainer.reason}`);
  if (!h.fcm.ok) parts.push(`Android FCM: ${h.fcm.reason}`);
  return parts.join(" / ");
}
