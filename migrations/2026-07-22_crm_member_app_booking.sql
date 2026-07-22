-- CRM 회원 앱 v1: 회원 셀프 예약(요청→승인) + 회원 디바이스 토큰
--
-- 배경: 기존 crm_reservations 는 직원(트레이너)이 직접 'booked' 로 생성하는 모델.
-- 회원 앱에서는 마이피티 가이드처럼 "예약대기(회원 요청) → 예약완료(트레이너 승인)"
-- 흐름이 필요하다. 그래서 status 에 requested/rejected 를 추가한다.
--
-- status 확장:
--   requested  = 예약대기   (회원 앱에서 요청, 트레이너 승인 대기) [신규]
--   booked     = 예약완료   (트레이너 승인 or 직원 직접 생성)
--   attended   = 출석완료
--   cancelled  = 예약취소
--   noshow     = 차감취소/노쇼
--   rejected   = 요청거절   (트레이너가 회원 요청을 거절, 미차감)          [신규]
--
-- 회원 요청은 requested 상태이므로 세션 잠정차감/캘린더 확정과 무관.
-- 트레이너가 승인하면 booked 로 전환된다(= 기존 예약과 동일 취급).

BEGIN;

-- 1) status CHECK 확장 ------------------------------------------------------
ALTER TABLE crm_reservations
  DROP CONSTRAINT IF EXISTS crm_reservations_status_check;
ALTER TABLE crm_reservations
  ADD CONSTRAINT crm_reservations_status_check
  CHECK (status IN ('requested','booked','attended','cancelled','noshow','rejected'));

-- 2) 회원 앱 예약 메타 컬럼 --------------------------------------------------
ALTER TABLE crm_reservations
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'staff'
    CHECK (source IN ('staff','member_app')),
  ADD COLUMN IF NOT EXISTS requested_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by_uid TEXT,
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT;

-- 트레이너 승인 대기함 조회용 (센터 + 상태 + 시작시각)
CREATE INDEX IF NOT EXISTS idx_crm_reservations_pending
  ON crm_reservations (center_id, status, starts_at)
  WHERE status = 'requested';

-- 3) 회원 디바이스 푸시 토큰 -----------------------------------------------
-- 회원 앱(모두의 회원) 전용. 직원용 device_tokens 와 분리.
CREATE TABLE IF NOT EXISTS crm_member_device_tokens (
  id            BIGSERIAL PRIMARY KEY,
  member_id     BIGINT NOT NULL REFERENCES crm_members(id) ON DELETE CASCADE,
  firebase_uid  TEXT NOT NULL,
  token         TEXT NOT NULL,
  platform      TEXT CHECK (platform IN ('ios','android')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_crm_member_device_tokens_member
  ON crm_member_device_tokens (member_id);

COMMIT;
