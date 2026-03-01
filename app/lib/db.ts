import { neon } from "@neondatabase/serverless";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sql: any = null;

function get_sql() {
  if (!_sql) {
    const raw = process.env.DATABASE_URL || "";
    const cleaned = raw.replace(/&channel_binding=[^&]*/g, "").trim();
    _sql = neon(cleaned);
  }
  return _sql;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sql: any = new Proxy(function () {}, {
  apply(_target, _thisArg, args) {
    return get_sql()(...args);
  },
});
