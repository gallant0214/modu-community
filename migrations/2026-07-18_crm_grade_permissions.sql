-- 등급별 개별 권한. 기존 crm_role_permissions(역할 4종)에서 등급 단위로 세분화.
-- grade_id 단위 override. 저장 안 된 (grade, permission) 은 등급의 base_role 기본값을 따름.
CREATE TABLE IF NOT EXISTS crm_grade_permissions (
  id             bigserial PRIMARY KEY,
  center_id      bigint NOT NULL,
  grade_id       bigint NOT NULL REFERENCES crm_grades(id) ON DELETE CASCADE,
  permission_key text   NOT NULL,
  enabled        boolean NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grade_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_crm_grade_permissions_center ON crm_grade_permissions(center_id);
