/**
 * DB 스키마 마이그레이션 — 더 이상 런타임에서 실행 안 함.
 *
 * Supabase 마이그레이션 후 모든 테이블/컬럼이 이미 존재.
 * 향후 스키마 변경은 SQL Editor 또는 마이그레이션 파일로 처리.
 */
export async function ensureSchema() {
  return Promise.resolve();
}
