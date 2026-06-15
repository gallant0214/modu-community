-- CRM 모듈 #7: 센터별 커스텀 직원 등급
--
-- 2026-06-15 사용자 결정:
--   - 등급 = 라벨 + base_role 매핑 (권한 게이트는 base_role 기준)
--   - 기본 4개(대표자/관리자/팀장/강사)는 시스템 등급, 이름 변경 가능 / 삭제 불가
--   - 센터별 추가 등급 가능 (예: 수석강사 base=trainer)
--
-- crm_center_members.grade_id 추가:
--   - 직원에게 부여된 실제 등급 (시스템 또는 커스텀)
--   - 기존 role 컬럼은 권한 게이트용 base_role 로 계속 사용
--   - 등급 변경 시 role 도 같이 sync (애플리케이션 레벨)

CREATE TABLE IF NOT EXISTS crm_grades (
  id          BIGSERIAL PRIMARY KEY,
  center_id   BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  base_role   TEXT NOT NULL CHECK (base_role IN ('owner','admin','manager','trainer')),
  label       TEXT NOT NULL,
  is_system   BOOLEAN NOT NULL DEFAULT false,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (center_id, label)
);

CREATE INDEX IF NOT EXISTS idx_crm_grades_center
  ON crm_grades (center_id, sort_order);

CREATE OR REPLACE FUNCTION crm_grades_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_grades_updated_at ON crm_grades;
CREATE TRIGGER trg_crm_grades_updated_at
  BEFORE UPDATE ON crm_grades
  FOR EACH ROW EXECUTE FUNCTION crm_grades_set_updated_at();


-- 모든 기존 센터에 기본 4개 시스템 등급 시드
INSERT INTO crm_grades (center_id, base_role, label, is_system, sort_order)
SELECT c.id, b.base_role, b.label, true, b.sort_order
FROM crm_centers c
CROSS JOIN (VALUES
  ('owner'::TEXT,   '대표자'::TEXT, 0),
  ('admin'::TEXT,   '관리자'::TEXT, 1),
  ('manager'::TEXT, '팀장'::TEXT,   2),
  ('trainer'::TEXT, '강사'::TEXT,   3)
) AS b(base_role, label, sort_order)
ON CONFLICT (center_id, label) DO NOTHING;


-- crm_center_members 에 grade_id 컬럼 추가
ALTER TABLE crm_center_members
  ADD COLUMN IF NOT EXISTS grade_id BIGINT REFERENCES crm_grades(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_center_members_grade
  ON crm_center_members (grade_id);

-- 기존 row 백필 (role → 시스템 등급 매핑)
UPDATE crm_center_members m
SET grade_id = g.id
FROM crm_grades g
WHERE g.center_id = m.center_id
  AND g.is_system = true
  AND g.base_role = m.role
  AND m.grade_id IS NULL;
