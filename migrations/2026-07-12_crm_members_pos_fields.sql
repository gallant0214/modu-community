-- POS(BROJ) 고객목록 마이그레이션용 crm_members 확장 컬럼
-- 2026-07-12: 스페셜바디(center_id=1) 실회원 2,573명 임포트와 함께 추가
-- 전부 nullable/default 로 앱 호환 안전. marketing_consent 는 추후 회원 앱에서 on/off 예정.
ALTER TABLE crm_members
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS visit_route text,        -- 방문 경로
  ADD COLUMN IF NOT EXISTS workout_goal text,       -- 운동 목적
  ADD COLUMN IF NOT EXISTS counselor text,          -- 상담 담당자
  ADD COLUMN IF NOT EXISTS mileage integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS marketing_consent boolean NOT NULL DEFAULT false;
