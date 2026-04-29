-- 2026-04-29: notification_preferences 에 쪽지 알림 토글 컬럼 추가
-- Supabase SQL Editor 에서 실행.
-- 기본값 TRUE: 기존 사용자도 쪽지 알림 ON 으로 시작.

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS notify_message BOOLEAN DEFAULT TRUE;

-- 검증
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'notification_preferences' AND column_name = 'notify_message';
