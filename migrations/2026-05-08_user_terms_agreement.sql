-- 2026-05-08: 사용자 약관/개인정보 동의 기록
-- 첫 로그인 후 이용 약관 + 개인정보처리방침 동의 시 timestamp 저장.
-- 이용약관 개정 시 terms_version 비교로 재동의 트리거 가능.

ALTER TABLE nicknames
  ADD COLUMN IF NOT EXISTS terms_agreed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS privacy_agreed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_version TEXT;

-- 검증
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'nicknames'
  AND column_name IN ('terms_agreed_at', 'privacy_agreed_at', 'terms_version')
ORDER BY ordinal_position;
