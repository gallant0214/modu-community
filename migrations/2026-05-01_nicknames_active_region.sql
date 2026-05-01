-- 2026-05-01: 닉네임 행에 활동 지역 컬럼 추가 (앱의 "내 활동 지역" 기능 지원)
-- Supabase SQL Editor 에서 실행. (이 세션에선 psql 로 이미 적용 완료)

ALTER TABLE nicknames
  ADD COLUMN IF NOT EXISTS active_region_code TEXT,
  ADD COLUMN IF NOT EXISTS active_region_name TEXT;

-- 검증
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'nicknames' AND column_name LIKE 'active_%' ORDER BY column_name;
