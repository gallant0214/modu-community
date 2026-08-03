-- 회원 마일리지 적립/사용 원장 (회원 앱 '보유 마일리지' 이력용)
-- crm_members.mileage 는 누적 잔액(권위값). 이 표는 변동 이력을 남긴다.
-- 퇴실 적립 등 회원 앱발 변동을 기록. 과거 출석 적립분은 crm_attendances 에서 합산 조회.
CREATE TABLE IF NOT EXISTS crm_member_mileage_logs (
  id            BIGSERIAL PRIMARY KEY,
  center_id     BIGINT REFERENCES crm_centers(id) ON DELETE CASCADE,
  member_id     BIGINT NOT NULL REFERENCES crm_members(id) ON DELETE CASCADE,
  delta         INTEGER NOT NULL,          -- +적립 / -사용
  reason        TEXT NOT NULL,             -- checkout / attendance / adjust 등
  balance_after INTEGER,                   -- 변동 후 잔액(스냅샷)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_member_mileage_logs_member
  ON crm_member_mileage_logs (member_id, created_at DESC);
