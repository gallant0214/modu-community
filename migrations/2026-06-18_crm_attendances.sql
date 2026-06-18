-- CRM: 회원 출석 체크 + 회원별 체크인 토큰
--
-- crm_attendances: 출석 기록 (회원별 시계열)
-- crm_members.checkin_token: 회원별 고유 토큰 (UUID, QR/숫자코드 발급용)

ALTER TABLE crm_members
  ADD COLUMN IF NOT EXISTS checkin_token TEXT UNIQUE;

-- 기존 회원에게 토큰 자동 생성
UPDATE crm_members
SET checkin_token = encode(gen_random_bytes(8), 'hex')
WHERE checkin_token IS NULL;

CREATE TABLE IF NOT EXISTS crm_attendances (
  id             BIGSERIAL PRIMARY KEY,
  center_id      BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  member_id      BIGINT NOT NULL REFERENCES crm_members(id) ON DELETE CASCADE,
  checked_in_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  source         TEXT NOT NULL DEFAULT 'kiosk' CHECK (source IN ('kiosk','manual','app')),
  note           TEXT
);

CREATE INDEX IF NOT EXISTS idx_crm_attendances_member
  ON crm_attendances (member_id, checked_in_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_attendances_center
  ON crm_attendances (center_id, checked_in_at DESC);
