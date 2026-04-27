import postgres from "postgres";

let _sql: ReturnType<typeof postgres> | null = null;

function get_sql() {
  if (!_sql) {
    let raw = process.env.DATABASE_URL || "";
    raw = raw.replace(/^Value:\s*/i, "").trim();
    _sql = postgres(raw, {
      max: 5,
      idle_timeout: 20,
      prepare: false,
    });
  }
  return _sql;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sql: any = new Proxy(function () {}, {
  apply(_target, _thisArg, args) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (get_sql() as any)(...args);
  },
});
