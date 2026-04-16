/**
 * DB 스키마 마이그레이션 (인스턴스당 최초 1회 실행)
 *
 * 이전엔 ALTER TABLE IF NOT EXISTS를 매 요청마다 실행해
 * 요청당 100~300ms 낭비가 발생했음.
 * 이제 cold start 시 한 번만 실행하고 이후 요청은 즉시 통과.
 */
import { sql } from "./db";

const _init = (async () => {
  try {
    await Promise.all([
      // posts
      sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS firebase_uid TEXT`,
      sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false`,
      // post_likes
      sql`ALTER TABLE post_likes ADD COLUMN IF NOT EXISTS firebase_uid TEXT`,
      // comments
      sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS firebase_uid TEXT`,
      sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false`,
      // comment_likes
      sql`ALTER TABLE comment_likes ADD COLUMN IF NOT EXISTS firebase_uid TEXT`,
      // inquiries
      sql`ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS email TEXT DEFAULT ''`,
      sql`ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS firebase_uid TEXT`,
      sql`ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false`,
      sql`ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE`,
      // nicknames
      sql`ALTER TABLE nicknames ADD COLUMN IF NOT EXISTS firebase_uid TEXT`,
      sql`ALTER TABLE nicknames ADD COLUMN IF NOT EXISTS changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`,
      // job_posts
      sql`ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS firebase_uid TEXT`,
      sql`ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false`,
      sql`ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS share_count INT DEFAULT 0`,
      // posts
      sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS share_count INT DEFAULT 0`,
      // job_post_likes
      sql`ALTER TABLE job_post_likes ADD COLUMN IF NOT EXISTS firebase_uid TEXT`,
      // job_post_bookmarks
      sql`ALTER TABLE job_post_bookmarks ADD COLUMN IF NOT EXISTS firebase_uid TEXT`,
      // reports
      sql`ALTER TABLE reports ADD COLUMN IF NOT EXISTS target_hidden BOOLEAN DEFAULT false`,
      // admin_broadcasts
      sql`ALTER TABLE admin_broadcasts ADD COLUMN IF NOT EXISTS fail_count INTEGER DEFAULT 0`,
      // notification_preferences
      sql`ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS notify_like BOOLEAN DEFAULT true`,
      // notification_logs
      sql`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS like_count INT DEFAULT 0`,
    ]);

    // NOT NULL 제약 조건 변경 (별도 — 에러가 나도 무시)
    await sql`ALTER TABLE reports ALTER COLUMN post_id DROP NOT NULL`.catch(() => {});
    await sql`ALTER TABLE reports ALTER COLUMN category_id DROP NOT NULL`.catch(() => {});
  } catch {
    // 테이블이 아직 없는 경우 등 — 무시 (seed.ts에서 생성)
  }
})();

/** cold start 시 한 번 실행된 마이그레이션 promise를 반환. 이미 완료됐으면 즉시 resolve. */
export async function ensureSchema() {
  return _init;
}
