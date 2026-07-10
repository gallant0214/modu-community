-- CRM: 직급별 권한 매트릭스
-- 각 (센터, 역할, 권한키) 조합의 On/Off. row 가 없으면 기본값 사용.

CREATE TABLE IF NOT EXISTS crm_role_permissions (
  id                BIGSERIAL PRIMARY KEY,
  center_id         BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  role_key          TEXT NOT NULL,          -- owner / admin / manager / trainer 또는 커스텀
  permission_key    TEXT NOT NULL,          -- 예: members.view, sales.edit
  enabled           BOOLEAN NOT NULL DEFAULT true,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (center_id, role_key, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_crm_role_permissions_center
  ON crm_role_permissions (center_id);
