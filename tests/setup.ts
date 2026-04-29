/**
 * Vitest setup — .env.test 로드 (테스트 전용 Supabase 프로젝트 yhiqqfzcubgvolszuddp)
 *
 * 보안: 운영(.env.local)이 아닌 테스트 환경 사용.
 * .env.test가 없으면 SUPABASE 변수 안 채워져서 통합 테스트는 실패 — 의도된 동작.
 * 단위 테스트는 env 안 써서 통과.
 */
import { config } from "dotenv";
import path from "path";
import fs from "fs";

const envTestPath = path.resolve(__dirname, "..", ".env.test");
if (fs.existsSync(envTestPath)) {
  config({ path: envTestPath });
} else {
  console.warn(
    "[vitest] .env.test 파일 없음 — 통합 테스트는 실패할 수 있음. 단위 테스트만 실행 시 무시.",
  );
}
