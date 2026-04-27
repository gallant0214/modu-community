import { NextResponse } from "next/server";
import { verifyAuth } from "./firebase-admin";
import { checkRateLimit, getClientIp } from "./security";
import { timingSafeEqual } from "crypto";
import { supabase } from "./supabase";

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

/**
 * 관리자 인증: Firebase 인증 + 관리자 비밀번호 이중 확인
 * Rate Limiting 포함
 */
export async function verifyAdmin(
  request: Request,
  password: string
): Promise<NextResponse | null> {
  // Rate limiting
  const ip = getClientIp(request);
  const rateLimitResponse = checkRateLimit(ip, "write");
  if (rateLimitResponse) return rateLimitResponse;

  // Firebase 인증 확인
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json(
      { error: "로그인이 필요합니다" },
      { status: 401 }
    );
  }

  // 관리자 비밀번호 확인 (DB 우선, 환경변수 fallback, timing-safe)
  const adminPassword = await getAdminPassword();
  if (!safeCompare(password, adminPassword)) {
    return NextResponse.json(
      { error: "관리자 비밀번호가 일치하지 않습니다" },
      { status: 403 }
    );
  }

  return null; // 인증 통과
}

/**
 * 관리자 인증 + user 정보 반환 버전
 */
export async function verifyAdminWithUser(
  request: Request,
  password: string
): Promise<NextResponse | { uid: string; email?: string }> {
  const ip = getClientIp(request);
  const rateLimitResponse = checkRateLimit(ip, "write");
  if (rateLimitResponse) return rateLimitResponse;

  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const adminPassword = await getAdminPassword();
  if (!safeCompare(password, adminPassword)) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  return user;
}

/** verifyAdminWithUser 결과가 에러 응답인지 확인 */
export function isAdminError(result: NextResponse | { uid: string }): result is NextResponse {
  return result instanceof NextResponse;
}

/**
 * 관리자 비밀번호 단순 비교 (Server Actions용 - Firebase 인증 없이)
 */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const adminPassword = await getAdminPassword();
  return safeCompare(password, adminPassword);
}
