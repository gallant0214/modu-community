-- 2026-04-29: 쪽지 soft delete (이용자가 삭제해도 DB 에는 남음, 관리자 확인용)
-- Supabase SQL Editor 에서 실행.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS deleted_by_sender BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_by_receiver BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_by_sender_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_receiver_at TIMESTAMPTZ;

-- 검증
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'messages'
  AND column_name LIKE 'deleted%'
ORDER BY column_name;
