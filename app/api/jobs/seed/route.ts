import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * 옛 부트스트랩 엔드포인트 — 모든 테이블이 마이그레이션 완료된 후 no-op.
 * 새 테이블/스키마 변경은 SQL Editor 또는 마이그레이션 파일로 처리.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { password } = body;

  if (!password) {
    return NextResponse.json({ error: "관리자 비밀번호가 필요합니다" }, { status: 401 });
  }

  const authError = await verifyAdmin(request, password);
  if (authError) return authError;

  return NextResponse.json({ success: true, message: "schema already exists" });
}
