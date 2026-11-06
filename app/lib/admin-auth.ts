import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { verifyAuth, verifyIdTokenString, isAdminUid } from "./firebase-admin";
import { authFailureCount, recordAuthFailure, getClientIp } from "./security";
import { timingSafeEqual } from "crypto";
import { supabase } from "./supabase";

/**
 * 관리자 인증.
 *
 * 🚨 2026-11-06 강화 (구 감사 M1):
 *   - 관리자 비밀번호를 **IP별 1분 5회 틀리면** 그 1분 동안은 맞는 비밀번호도 거절한다(무작위 대입 차단).
 *     실패 횟수는 Redis 공유 카운터라 서버가 여러 대여도 정확하다.
 *   - /developer 가 쓰는 관리자 기능은 비밀번호 + **관리자 구글 계정 로그인**(ADMIN_UIDS·admin_emails)이
 *     둘 다 맞아야 한다. 예전엔 비밀번호 하나만 보고, 일부는 비밀번호를 주소(?password=)에 실었다.
 *   - 비밀번호는 요청 본문 또는 `x-admin-password` 헤더로만 받는다(주소 금지 — 접속 기록에 남는다).
 */

const ADMIN_PW_MAX_FAILS = 5;
const ADMIN_PW_SCOPE = "adminpw";

/** 상수 시간 문자열 비교 (timing attack 방지) */
function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/** DB에 저장된 관리자 비밀번호 조회, 없으면 환경변수 사용 */
async function getAdminPassword(): Promise<string> {
  const { data } = await supabase
    .from("admin_settings")
    .select("value")
    .eq("key", "admin_password")
    .maybeSingle();
  if (data?.value) return data.value;
  return process.env.ADMIN_PASSWORD || "";
}

/** 라우트·서버 액션 공용 — 지금 요청의 IP */
async function currentIp(): Promise<string> {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  } catch {
    return "unknown";
  }
}

/** 비밀번호 비교 + 실패 잠금. 잠긴 동안은 비교 자체를 하지 않는다 */
async function checkAdminPassword(password: unknown, ip: string): Promise<"ok" | "bad" | "locked"> {
  if ((await authFailureCount(ADMIN_PW_SCOPE, ip)) >= ADMIN_PW_MAX_FAILS) return "locked";
  const adminPassword = await getAdminPassword();
  const ok = typeof password === "string" && !!password && !!adminPassword && safeCompare(password, adminPassword);
  if (!ok && typeof password === "string" && password) await recordAuthFailure(ADMIN_PW_SCOPE, ip);
  return ok ? "ok" : "bad";
}

/** 관리자 계정(구글 로그인) 여부 — ADMIN_UIDS 부트스트랩 또는 admin_emails 등록 이메일 */
export async function isAdminAccount(user: { uid: string; email?: string | null } | null): Promise<boolean> {
  if (!user) return false;
  if (isAdminUid(user.uid)) return true;
  if (!user.email) return false;
  const { count } = await supabase
    .from("admin_emails")
    .select("id", { count: "exact", head: true })
    .eq("email", user.email.toLowerCase());
  return (count ?? 0) > 0;
}

/**
 * 관리자 비밀번호 — 본문 값이 있으면 그것, 없으면 `x-admin-password` 헤더(encodeURIComponent 된 값).
 * GET 처럼 본문이 없는 요청은 헤더로 보낸다. 주소(?password=)는 받지 않는다.
 */
export function adminPasswordFrom(request: Request, bodyPassword?: unknown): string {
  if (typeof bodyPassword === "string" && bodyPassword) return bodyPassword;
  const h = request.headers.get("x-admin-password");
  if (!h) return "";
  try {
    return decodeURIComponent(h);
  } catch {
    return h;
  }
}

const LOCKED_RESPONSE = () =>
  NextResponse.json(
    { error: "관리자 비밀번호를 여러 번 틀렸어요. 1분 뒤 다시 시도해 주세요." },
    { status: 429 }
  );

/**
 * 관리자 인증 (라우트용): 관리자 구글 계정 로그인 + 관리자 비밀번호.
 * 통과하면 null, 아니면 에러 응답.
 */
export async function verifyAdmin(request: Request, password: unknown): Promise<NextResponse | null> {
  const r = await verifyAdminWithUser(request, password);
  return isAdminError(r) ? r : null;
}

/** 관리자 인증 + user 정보 반환 버전 */
export async function verifyAdminWithUser(
  request: Request,
  password: unknown
): Promise<NextResponse | { uid: string; email?: string }> {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "관리자 계정으로 로그인이 필요합니다" }, { status: 401 });
  }
  if (!(await isAdminAccount(user))) {
    return NextResponse.json({ error: "관리자로 등록되지 않은 계정입니다" }, { status: 403 });
  }
  const r = await checkAdminPassword(adminPasswordFrom(request, password), getClientIp(request));
  if (r === "locked") return LOCKED_RESPONSE();
  if (r === "bad") {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }
  return user;
}

/** verifyAdminWithUser 결과가 에러 응답인지 확인 */
export function isAdminError(result: NextResponse | { uid: string }): result is NextResponse {
  return result instanceof NextResponse;
}

/**
 * 관리자 인증 (서버 액션용): 구글 로그인 토큰(idToken) + 관리자 비밀번호.
 * 서버 액션은 Authorization 헤더가 없으므로 호출하는 쪽이 idToken 을 인자로 넘긴다.
 * 통과하면 null, 아니면 화면에 보여줄 에러 문구.
 */
export async function verifyAdminAction(adminPassword: string, idToken?: string | null): Promise<string | null> {
  const user = await verifyIdTokenString(idToken);
  if (!user) return "관리자 계정으로 로그인이 필요합니다";
  if (!(await isAdminAccount(user))) return "관리자로 등록되지 않은 계정입니다";
  const r = await checkAdminPassword(adminPassword, await currentIp());
  if (r === "locked") return "관리자 비밀번호를 여러 번 틀렸어요. 1분 뒤 다시 시도해 주세요.";
  if (r === "bad") return "관리자 비밀번호가 일치하지 않습니다";
  return null;
}

/**
 * 관리자 비밀번호만 비교 (커뮤니티 글·댓글·문의의 '만능 비밀번호' 용) — 실패 잠금 적용.
 * 🚨 글 작성자 본인 비밀번호 확인을 **먼저** 하고, 그게 틀렸을 때만 이걸 부를 것.
 *   순서를 반대로 하면 일반 사용자가 자기 비밀번호를 칠 때마다 '관리자 비번 실패'로 세어진다.
 */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  return (await checkAdminPassword(password, await currentIp())) === "ok";
}
