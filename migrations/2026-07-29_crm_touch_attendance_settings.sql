-- 터치출석 설정 (센터별 단일 row)
-- 목적: 브로제이 스타일의 출석관리 앱 설정을 CRM 에서 관리.
--   * 상황별 안내 멘트 (활성/생일/만료 임박/만료/홀딩 등)
--   * 앱 동작 설정 (사진촬영 권유·식별자 방식·재입장 시간·마일리지 등)
BEGIN;

CREATE TABLE IF NOT EXISTS crm_touch_attendance_settings (
  center_id BIGINT PRIMARY KEY REFERENCES crm_centers(id) ON DELETE CASCADE,

  -- 안내 멘트 (텍스트, 빈 값이면 재생 안 함)
  msg_active_entry           TEXT NOT NULL DEFAULT '출석 포인트가 적립되었습니다',
  msg_birthday_entry         TEXT NOT NULL DEFAULT '생일 축하드립니다',
  msg_expiring_membership    TEXT NOT NULL DEFAULT '회원권이 곧 만료 예정입니다',
  msg_exit                   TEXT NOT NULL DEFAULT '퇴실 포인트가 적립되었습니다',
  msg_outstanding            TEXT NOT NULL DEFAULT '',
  msg_expired_membership     TEXT NOT NULL DEFAULT '회원권이 만료되었습니다. 카운터에 문의주세요!',
  msg_expired_rental         TEXT NOT NULL DEFAULT '운동복이 만료되었습니다. 카운터에 문의주세요!',
  msg_expired_locker         TEXT NOT NULL DEFAULT '락커가 만료되었습니다. 카운터에 문의주세요!',
  msg_holding                TEXT NOT NULL DEFAULT '',
  msg_scheduled_membership   TEXT NOT NULL DEFAULT '',

  -- 동작 설정
  photo_suggest_enabled   BOOLEAN NOT NULL DEFAULT true,
  identifier_use_number   BOOLEAN NOT NULL DEFAULT true,   -- 출석번호 사용
  identifier_use_phone    BOOLEAN NOT NULL DEFAULT false,  -- 휴대폰번호 사용
  identifier_use_unified  BOOLEAN NOT NULL DEFAULT false,  -- 통합번호 사용
  attendance_mode_enabled BOOLEAN NOT NULL DEFAULT true,   -- 출석 모드 사용
  staff_call_enabled      BOOLEAN NOT NULL DEFAULT true,   -- 직원 호출 사용
  exit_enabled            BOOLEAN NOT NULL DEFAULT true,   -- 퇴장하기 기능
  entry_reentry_minutes   INTEGER NOT NULL DEFAULT 180,    -- 입장출석 재입장시간(분)
  lesson_reentry_until_end BOOLEAN NOT NULL DEFAULT true,  -- 수업출석 재입장시간=수업 종료시간까지

  attendance_mileage_earn  INTEGER NOT NULL DEFAULT 50,    -- 출석 마일리지 적립
  expiring_threshold_days  INTEGER NOT NULL DEFAULT 5,     -- 만료임박 기준 (일)

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE crm_touch_attendance_settings IS
  '터치출석 앱 설정: 안내 멘트·식별자·재입장시간·마일리지 등 (센터당 1 row)';

COMMIT;
