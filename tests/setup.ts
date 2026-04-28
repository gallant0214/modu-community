/**
 * Vitest setup — .env.local 로드 (실제 Supabase 사용 통합 테스트용)
 *
 * 주의: 이 셋업 파일이 실행되면 SUPABASE_URL/SERVICE_ROLE_KEY가 process.env에 들어감.
 * 통합 테스트가 실제 운영 Supabase에 접근하므로 — 절대 운영 데이터 변경하지 않도록
 * 각 테스트는 본인이 만든 데이터만 만지고 정리해야 함.
 */
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(__dirname, "..", ".env.local") });

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "통합 테스트 실행하려면 .env.local 에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요",
  );
}
