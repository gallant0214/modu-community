-- 2026-05-03: reports 테이블에 reporter_uid 컬럼 추가
-- 관리자 페이지에서 신고자 닉네임/이메일을 보여주려면 누가 신고했는지 식별 필요.
-- Firebase UID 만 저장하고 닉네임/이메일은 조회 시점에 nicknames 테이블 + Firebase Admin SDK 로 보강.
-- Supabase SQL Editor 에서 실행.

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS reporter_uid TEXT;

CREATE INDEX IF NOT EXISTS reports_reporter_uid_idx ON reports (reporter_uid);

-- 검증
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'reports' ORDER BY ordinal_position;
