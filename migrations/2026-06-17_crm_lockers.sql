-- CRM: 개별 락커 + 사용 이력
--
-- crm_locker_zones (이미 존재) = 락커룸 (남자탈의실 등)
-- crm_lockers (신규) = 락커룸 안의 개별 락커
-- crm_locker_history (신규) = 배정·회수·고장 이력

CREATE TABLE IF NOT EXISTS crm_lockers (
  id                    BIGSERIAL PRIMARY KEY,
  center_id             BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  zone_id               BIGINT NOT NULL REFERENCES crm_locker_zones(id) ON DELETE CASCADE,
  number                INTEGER NOT NULL,
  state                 TEXT NOT NULL DEFAULT 'unassigned'
                        CHECK (state IN ('unassigned','assigned','broken')),
  assigned_member_id    BIGINT REFERENCES crm_members(id) ON DELETE SET NULL,
  start_date            DATE,
  expires_at            DATE,
  password              TEXT,
  memo                  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (zone_id, number)
);

CREATE INDEX IF NOT EXISTS idx_crm_lockers_zone
  ON crm_lockers (zone_id, number);

CREATE INDEX IF NOT EXISTS idx_crm_lockers_member
  ON crm_lockers (assigned_member_id)
  WHERE assigned_member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_lockers_expires
  ON crm_lockers (center_id, expires_at)
  WHERE state = 'assigned';

CREATE OR REPLACE FUNCTION crm_lockers_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_lockers_updated_at ON crm_lockers;
CREATE TRIGGER trg_crm_lockers_updated_at
  BEFORE UPDATE ON crm_lockers
  FOR EACH ROW EXECUTE FUNCTION crm_lockers_set_updated_at();


-- 이력 테이블 (회원이 삭제돼도 기록 유지)
CREATE TABLE IF NOT EXISTS crm_locker_history (
  id              BIGSERIAL PRIMARY KEY,
  center_id       BIGINT NOT NULL,
  locker_id       BIGINT,
  zone_id         BIGINT NOT NULL,
  number          INTEGER NOT NULL,
  action          TEXT NOT NULL
                  CHECK (action IN ('assign','return','move','broken','repaired','update')),
  member_id       BIGINT,
  member_name     TEXT,
  start_date      DATE,
  expires_at      DATE,
  note            TEXT,
  actor_uid       TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_locker_history_center
  ON crm_locker_history (center_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_locker_history_zone
  ON crm_locker_history (center_id, zone_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_locker_history_locker
  ON crm_locker_history (locker_id, created_at DESC);
