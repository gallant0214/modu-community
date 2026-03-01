import { neon } from "@neondatabase/serverless";

function getDb() {
  const raw = process.env.DATABASE_URL || "";
  const cleaned = raw.replace(/&channel_binding=[^&]*/g, "").trim();
  return neon(cleaned);
}

export const sql = getDb();
