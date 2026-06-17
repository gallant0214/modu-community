-- CRM: 락커 구역 설정
--
-- 센터당 구역 1~8 고정. 각 구역의 이름·락커 갯수·시작 번호 저장.

CREATE TABLE IF NOT EXISTS crm_locker_zones (
  id            BIGSERIAL PRIMARY KEY,
  center_id     BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  zone_number   INTEGER NOT NULL CHECK (zone_number BETWEEN 1 AND 8),
  name          TEXT NOT NULL,
  locker_count  INTEGER NOT NULL DEFAULT 0 CHECK (locker_count >= 0),
  start_number  INTEGER NOT NULL DEFAULT 1 CHECK (start_number >= 1),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (center_id, zone_number)
);

CREATE INDEX IF NOT EXISTS idx_crm_locker_zones_center
  ON crm_locker_zones (center_id, zone_number);

CREATE OR REPLACE FUNCTION crm_locker_zones_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_locker_zones_updated_at ON crm_locker_zones;
CREATE TRIGGER trg_crm_locker_zones_updated_at
  BEFORE UPDATE ON crm_locker_zones
  FOR EACH ROW EXECUTE FUNCTION crm_locker_zones_set_updated_at();


-- 기존 센터에 디폴트 8개 구역 시드 (이름은 "구역 N")
INSERT INTO crm_locker_zones (center_id, zone_number, name, locker_count, start_number)
SELECT c.id, n, '구역 ' || n, 0, 1
FROM crm_centers c
CROSS JOIN generate_series(1, 8) AS n
ON CONFLICT (center_id, zone_number) DO NOTHING;
