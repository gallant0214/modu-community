import http2 from "node:http2";
import crypto from "node:crypto";

/**
 * APNs(Apple Push Notification service) 직접 발송기.
 *
 * 강사앱(iOS)은 expo-notifications 의 getDevicePushTokenAsync() 가 **APNs 원시 토큰**(64 hex)
 * 을 돌려준다(FCM 등록 토큰이 아님). Firebase Admin FCM(sendEachForMulticast)은 FCM 토큰만
 * 받으므로 iOS 토큰으로는 발송이 조용히 실패한다. → iOS 는 이 유틸로 APNs 에 직접 보낸다.
 *
 * 필요한 환경변수:
 *   APNS_AUTH_KEY   : Apple Developer 의 APNs 인증키 .p8 내용 (PEM 원문 또는 base64)
 *   APNS_KEY_ID     : 그 키의 Key ID (10자)
 *   APNS_TEAM_ID    : Apple Developer 팀 ID (10자)
 *   APNS_BUNDLE_ID  : 앱 번들 ID (기본 com.moduji.trainer)
 *   APNS_PRODUCTION : "false" 면 sandbox(개발 빌드) 사용. 기본 production(앱스토어/TestFlight).
 */

const PROD_HOST = "api.push.apple.com";
const SANDBOX_HOST = "api.sandbox.push.apple.com";

function normalizePrivateKey(raw: string): string {
  const v = raw.trim();
  // PEM 원문(줄바꿈이 \n 리터럴로 들어온 경우 포함)
  if (v.includes("BEGIN")) return v.replace(/\\n/g, "\n");
  // base64 로 넣은 경우 디코드
  try {
    return Buffer.from(v, "base64").toString("utf8");
  } catch {
    return v;
  }
}

let cachedJwt: { token: string; iat: number } | null = null;

/** APNs provider JWT (ES256). 20~60분 주기 갱신 권장 → 50분 캐시. */
function buildProviderToken(keyId: string, teamId: string, privateKeyPem: string): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwt.iat < 50 * 60) return cachedJwt.token;

  const header = { alg: "ES256", kid: keyId };
  const payload = { iss: teamId, iat: now };
  const b64 = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const signingInput = `${b64(header)}.${b64(payload)}`;
  // JOSE 는 raw R||S(ieee-p1363) 서명 필요. Node crypto.sign 의 DER 기본을 p1363 으로.
  const sig = crypto
    .sign("sha256", Buffer.from(signingInput), {
      key: privateKeyPem,
      dsaEncoding: "ieee-p1363",
    })
    .toString("base64url");
  const token = `${signingInput}.${sig}`;
  cachedJwt = { token, iat: now };
  return token;
}

export type ApnsPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
  badge?: number;
  /** 앱 번들 ID 재정의 — 미지정 시 env APNS_BUNDLE_ID 또는 트레이너 기본값. 회원앱은 com.moduji.member 전달 */
  bundleId?: string;
};

export type ApnsResult = {
  configured: boolean;
  sent: number;
  failed: number;
  /** 더 이상 유효하지 않아 삭제해야 할 토큰(BadDeviceToken/Unregistered). */
  invalidTokens: string[];
};

export function apnsConfigured(): boolean {
  return !!(process.env.APNS_AUTH_KEY && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID);
}

/**
 * iOS APNs 토큰들로 알림 발송. 미설정(환경변수 없음)이면 configured=false 로 조용히 반환.
 */
export async function sendApnsPush(tokens: string[], payload: ApnsPayload): Promise<ApnsResult> {
  const result: ApnsResult = { configured: false, sent: 0, failed: 0, invalidTokens: [] };
  if (tokens.length === 0) return { ...result, configured: apnsConfigured() };
  if (!apnsConfigured()) return result;
  result.configured = true;

  const keyId = process.env.APNS_KEY_ID!;
  const teamId = process.env.APNS_TEAM_ID!;
  // 번들은 호출자 지정 > env > 트레이너 기본. 회원앱은 com.moduji.member 를 넘긴다.
  const bundleId = payload.bundleId || process.env.APNS_BUNDLE_ID || "com.moduji.trainer";
  const privateKeyPem = normalizePrivateKey(process.env.APNS_AUTH_KEY!);
  const forcedSandbox =
    process.env.APNS_PRODUCTION === "false" || process.env.APNS_ENV === "sandbox";

  let jwt: string;
  try {
    jwt = buildProviderToken(keyId, teamId, privateKeyPem);
  } catch (e) {
    console.error("[apns] JWT 생성 실패", e);
    result.failed = tokens.length;
    return result;
  }

  const bodyJson = JSON.stringify({
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: "default",
      badge: payload.badge ?? 1,
    },
    ...(payload.data ?? {}),
  });

  // 1차: 설정 환경(기본 production). 2차: 환경 불일치(BadDeviceToken) 토큰만 반대 환경 재시도.
  // 🚨 앱스토어/TestFlight=production, dev-client=sandbox 토큰이 섞일 수 있어 자동 폴백한다.
  const primaryHost = forcedSandbox ? SANDBOX_HOST : PROD_HOST;
  const first = await sendToApnsHost(primaryHost, tokens, jwt, bundleId, bodyJson, forcedSandbox);
  result.sent += first.sent;
  result.invalidTokens.push(...first.invalid);
  if (!forcedSandbox && first.retry.length > 0) {
    const second = await sendToApnsHost(SANDBOX_HOST, first.retry, jwt, bundleId, bodyJson, true);
    result.sent += second.sent;
    result.invalidTokens.push(...second.invalid);
  }
  result.failed = tokens.length - result.sent;
  return result;
}

type HostResult = { sent: number; invalid: string[]; retry: string[] };

/** 한 APNs 호스트로 발송. lastEnv=true 면 BadDeviceToken 도 재시도 않고 무효 처리. */
function sendToApnsHost(
  host: string,
  tokens: string[],
  jwt: string,
  bundleId: string,
  bodyJson: string,
  lastEnv: boolean
): Promise<HostResult> {
  return new Promise((resolveAll) => {
    const out: HostResult = { sent: 0, invalid: [], retry: [] };
    if (tokens.length === 0) return resolveAll(out);

    const client = http2.connect(`https://${host}`);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try { client.close(); } catch { /* noop */ }
      resolveAll(out);
    };
    const guard = setTimeout(finish, 15000);
    client.on("error", (e) => {
      console.error("[apns] http2 connect error", e);
      clearTimeout(guard);
      finish();
    });

    let pending = tokens.length;
    const one = () => { if (--pending <= 0) { clearTimeout(guard); finish(); } };

    for (const token of tokens) {
      let req: http2.ClientHttp2Stream;
      try {
        req = client.request({
          ":method": "POST",
          ":path": `/3/device/${token}`,
          authorization: `bearer ${jwt}`,
          "apns-topic": bundleId,
          "apns-push-type": "alert",
          "apns-priority": "10",
          "content-type": "application/json",
        });
      } catch {
        one();
        continue;
      }
      let status = 0;
      let respBody = "";
      req.setEncoding("utf8");
      req.on("response", (headers) => { status = Number(headers[":status"]) || 0; });
      req.on("data", (chunk) => { respBody += chunk; });
      req.on("error", (e) => { console.error("[apns] request error", e); one(); });
      req.on("end", () => {
        if (status === 200) {
          out.sent++;
        } else {
          let reason = "";
          try { reason = (JSON.parse(respBody) as { reason?: string }).reason ?? ""; } catch { /* noop */ }
          if (reason === "Unregistered" || status === 410) {
            out.invalid.push(token); // 앱 삭제/만료 → 제거
          } else if (reason === "BadDeviceToken" || reason === "DeviceTokenNotForTopic") {
            if (lastEnv) out.invalid.push(token);
            else out.retry.push(token); // 반대 환경(sandbox) 재시도
          }
          if (reason) console.error(`[apns] 발송 실패 host=${host} status=${status} reason=${reason}`);
        }
        one();
      });
      req.end(bodyJson);
    }
  });
}
