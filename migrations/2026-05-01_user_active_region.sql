-- 2026-05-01: 사용자별 활동 지역 (마이 → 설정에서 설정, 글쓰기 시 자동 입력)
-- Supabase SQL Editor 에서 실행.

ALTER TABLE nicknames
  ADD COLUMN IF NOT EXISTS active_region_code TEXT,
  ADD COLUMN IF NOT EXISTS active_region_name TEXT;

-- 검증
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'nicknames' ORDER BY ordinal_position;
