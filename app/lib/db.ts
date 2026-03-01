import { neon } from "@neondatabase/serverless";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sql: any = null;

function get_sql() {
  if (!_sql) {
    let raw = process.env.DATABASE_URL || "";
    // Vercel 환경변수 오류 대비: "Value:" 접두사 제거
    raw = raw.replace(/^Value:\s*/i, "");
    // channel_binding 파라미터 제거 (neon serverless 미지원)
    raw = raw.replace(/&channel_binding=[^&]*/g, "").trim();
    // postgresql:// → postgres:// 변환 (neon 호환성)
    raw = raw.replace(/^postgresql:\/\//, "postgres://");
    _sql = neon(raw);
  }
  return _sql;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sql: any = new Proxy(function () {}, {
  apply(_target, _thisArg, args) {
    return get_sql()(...args);
  },
});
