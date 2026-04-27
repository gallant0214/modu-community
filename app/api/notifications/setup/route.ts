import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * notifications/setup — 이전엔 CREATE TABLE IF NOT EXISTS로 스키마 생성하던 엔드포인트.
 * Supabase 마이그레이션 후 모든 테이블이 이미 존재하므로 no-op.
 * (스키마 변경은 마이그레이션 파일/SQL Editor에서 처리)
 */
export async function POST() {
  return NextResponse.json({ success: true, note: "schema already exists" });
}
