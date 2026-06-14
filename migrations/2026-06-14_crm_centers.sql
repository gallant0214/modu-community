-- CRM 모듈 #1: 센터 / 센터 멤버십 / 트레이너 권한
--
-- 한 사용자가 여러 센터에 속할 수 있고, 센터 안에서 role(center_owner/trainer)을 가짐.
-- 1인 트레이너 모드는 kind='solo' 가상 센터를 백그라운드 생성하여 동일 구조로 처리.

CREATE TABLE IF NOT EXISTS crm_centers (
  id              BIGSERIAL PRIMARY KEY,
  owner_uid       TEXT NOT NULL,                          -- 센터를 만든 사람 (탈퇴 시 NULL 대신 유지)
  name            TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('solo','center')),
  region_sido     TEXT,
  region_sigungu  TEXT,
  phone           TEXT,
  business_no     TEXT,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','closed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 한 사용자당 solo 센터는 최대 1개
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_centers_owner_solo
  ON crm_centers (owner_uid)
  WHERE kind = 'solo';

CREATE INDEX IF NOT EXISTS idx_crm_centers_owner
  ON crm_centers (owner_uid, status);


CREATE TABLE IF NOT EXISTS crm_center_members (
  id              BIGSERIAL PRIMARY KEY,
  center_id       BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  firebase_uid    TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('center_owner','trainer')),
  display_name    TEXT NOT NULL,
  phone           TEXT,
  email           TEXT,
  access_level    TEXT NOT NULL DEFAULT 'none'
                  CHECK (access_level IN ('admin','schedule','none')),
  is_solo_owner   BOOLEAN NOT NULL DEFAULT false,         -- solo 센터의 본인 row 식별용
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','inactive')), -- inactive = 퇴사
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (center_id, firebase_uid)
);

CREATE INDEX IF NOT EXISTS idx_crm_center_members_user
  ON crm_center_members (firebase_uid, status);

CREATE INDEX IF NOT EXISTS idx_crm_center_members_center
  ON crm_center_members (center_id, status, role);


-- 트레이너별 권한 (PDF 2-3) — center_owner는 항상 전체 권한이라 row 불필요. trainer만 row 보유.
CREATE TABLE IF NOT EXISTS crm_trainer_permissions (
  center_member_id            BIGINT PRIMARY KEY
                              REFERENCES crm_center_members(id) ON DELETE CASCADE,
  can_create_reservation      BOOLEAN NOT NULL DEFAULT true,
  can_modify_reservation      BOOLEAN NOT NULL DEFAULT true,
  can_cancel_reservation      BOOLEAN NOT NULL DEFAULT true,
  attendance_mode             TEXT NOT NULL DEFAULT 'trainer'
                              CHECK (attendance_mode IN ('trainer','owner_only')),
  can_cancel_attendance       BOOLEAN NOT NULL DEFAULT true,
  can_issue_pass              BOOLEAN NOT NULL DEFAULT true,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION crm_centers_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_centers_updated_at ON crm_centers;
CREATE TRIGGER trg_crm_centers_updated_at
  BEFORE UPDATE ON crm_centers
  FOR EACH ROW EXECUTE FUNCTION crm_centers_set_updated_at();

DROP TRIGGER IF EXISTS trg_crm_center_members_updated_at ON crm_center_members;
CREATE TRIGGER trg_crm_center_members_updated_at
  BEFORE UPDATE ON crm_center_members
  FOR EACH ROW EXECUTE FUNCTION crm_centers_set_updated_at();

DROP TRIGGER IF EXISTS trg_crm_trainer_permissions_updated_at ON crm_trainer_permissions;
CREATE TRIGGER trg_crm_trainer_permissions_updated_at
  BEFORE UPDATE ON crm_trainer_permissions
  FOR EACH ROW EXECUTE FUNCTION crm_centers_set_updated_at();
