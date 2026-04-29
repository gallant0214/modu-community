-- 2026-04-29: 사용자 간 차단 기능 (쪽지 차단용)
-- Supabase SQL Editor 에서 실행.

CREATE TABLE IF NOT EXISTS user_blocks (
  id SERIAL PRIMARY KEY,
  blocker_uid TEXT NOT NULL,
  blocked_uid TEXT NOT NULL,
  blocked_nickname TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (blocker_uid, blocked_uid)
);

CREATE INDEX IF NOT EXISTS user_blocks_blocker_idx ON user_blocks (blocker_uid);
CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON user_blocks (blocked_uid);

-- 검증
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'user_blocks' ORDER BY ordinal_position;
