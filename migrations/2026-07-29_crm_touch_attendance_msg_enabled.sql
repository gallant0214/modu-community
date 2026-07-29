-- 터치출석 설정: 각 멘트별 on/off 컬럼 추가
-- 목적: 빈 문자열 = 비활성 컨벤션 대신 명시적 boolean 으로 관리.
--       기본값 true (기존 동작 유지).
BEGIN;

ALTER TABLE crm_touch_attendance_settings
  ADD COLUMN IF NOT EXISTS msg_active_entry_enabled         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS msg_birthday_entry_enabled       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS msg_expiring_membership_enabled  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS msg_exit_enabled                 BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS msg_outstanding_enabled          BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS msg_expired_membership_enabled   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS msg_expired_rental_enabled       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS msg_expired_locker_enabled       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS msg_holding_enabled              BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS msg_scheduled_membership_enabled BOOLEAN NOT NULL DEFAULT true;

COMMIT;
