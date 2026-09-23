import "server-only";
import crypto from "crypto";

/**
 * 주문 결제 토큰 — 결제 페이지가 **웹 로그인 없이도** 그 주문 하나만 다룰 수 있게 하는 열쇠.
 *
 * 왜 필요한가: 결제 페이지 /pay/[orderUid] 를 회원앱이 WebView 로 연다.
 * WebView 안에는 웹 Firebase 로그인 세션이 없어서 평소의 회원 인증을 쓸 수 없다.
 * 앱과 웹이 결제 페이지를 한 벌로 공유하려면 이 방식이 필요하다.
 *
 * 안전한 이유:
 *   · 토큰은 **주문 1건에만** 유효하다(다른 주문·다른 회원에게 못 쓴다)
 *   · 발급물은 언제나 주문에 적힌 회원에게 간다 — 토큰을 가진 사람이 아니라
 *   · 유효시간이 짧다(주문 시한과 같은 30분)
 *   · 토큰을 손에 넣어봐야 할 수 있는 건 "그 주문의 결제를 대신 해주는 것"뿐이다
 */

const TTL_SECONDS = 35 * 60; // 주문 시한(30분)보다 조금 길게

function secret(): string {
  const s = process.env.ORDER_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("ORDER_TOKEN_SECRET 이 설정되지 않았습니다");
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** 주문 결제 토큰 발급 */
export function signOrderToken(orderUid: string): string {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = `${orderUid}.${exp}`;
  return `${exp}.${sign(payload)}`;
}

/** 이 토큰이 이 주문에 유효한가 */
export function verifyOrderToken(token: string | null | undefined, orderUid: string): boolean {
  if (!token) return false;
  const [expStr, sig] = String(token).split(".");
  if (!expStr || !sig) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;

  const expected = sign(`${orderUid}.${exp}`);
  // 길이가 다르면 timingSafeEqual 이 던지므로 먼저 거른다
  if (expected.length !== sig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}
