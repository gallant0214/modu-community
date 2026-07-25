-- 출석 알림(음성 안내) 규칙
-- 목적: 회원 체크인 시 조건에 맞는 안내 문구를 음성으로 재생.
--       예) 회원권 만료 7일 이내 → "회원권이 곧 만료 예정입니다"
BEGIN;

CREATE TABLE IF NOT EXISTS crm_attendance_voice_rules (
  id serial PRIMARY KEY,
  center_id integer NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  trigger_type text NOT NULL CHECK (trigger_type IN (
    'welcome',                -- 모든 체크인 (환영 인사)
    'expiring_membership',    -- 회원권 만료 N일 이내
    'expiring_pass',          -- 수강권 만료 N일 이내
    'low_pass_sessions',      -- 수강권 잔여 세션 N회 이하
    'birthday'                -- 오늘이 생일
  )),
  threshold_int integer,      -- 일수 or 회수 (welcome/birthday 는 null)
  message text NOT NULL,      -- 안내 문구. {name} 치환 지원
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voice_rules_center
  ON crm_attendance_voice_rules(center_id, enabled);

COMMENT ON TABLE crm_attendance_voice_rules IS '출석 체크인 시 재생할 음성 안내 규칙 (센터별)';
COMMENT ON COLUMN crm_attendance_voice_rules.threshold_int IS
  '트리거 임계값. expiring_* 은 일수, low_pass_sessions 는 회수. welcome/birthday 는 null';
COMMENT ON COLUMN crm_attendance_voice_rules.message IS
  '음성 안내 문구. {name} 은 회원 이름으로 치환';

COMMIT;
