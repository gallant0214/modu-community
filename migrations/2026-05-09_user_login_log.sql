-- 2026-05-09: 로그인 이력 — 분쟁/문의 시 사용자 활동 시점 추적용
-- "로그인 직후 1회만" 정책. 자동 토큰 갱신은 기록하지 않음.
-- 보유 기간: 운영 정책에 따라 향후 cron 으로 90일 등 정리 가능.
CREATE TABLE IF NOT EXISTS user_login_log (
  id BIGSERIAL PRIMARY KEY,
  firebase_uid TEXT NOT NULL,
  signed_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  platform TEXT NOT NULL,
  ip_hash TEXT,
  user_agent TEXT,
  CONSTRAINT chk_login_platform CHECK (platform IN ('web', 'ios', 'android'))
);

CREATE INDEX IF NOT EXISTS user_login_log_uid_time_idx
  ON user_login_log (firebase_uid, signed_in_at DESC);

CREATE INDEX IF NOT EXISTS user_login_log_signed_at_idx
  ON user_login_log (signed_in_at DESC);

-- 검증
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'user_login_log'
ORDER BY ordinal_position;
