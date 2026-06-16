-- CRM: 근무형태 '아르바이트' 추가 + 모든 센터에 '아르바이트'/'FC' 등급 시드
--
-- 2026-06-16 사용자 요청:
--   1) 근무형태 part_time 옵션 추가 (CHECK 제약 확장)
--   2) 등급(직원 grade)에 "아르바이트"·"FC" 추가
--      → 기본 시스템 4개(owner/admin/manager/trainer) 는 그대로
--      → "아르바이트"·"FC" 는 base_role=trainer 기반의 일반 등급 (is_system=false)

-- 1) 근무형태 CHECK 제약 확장
ALTER TABLE crm_center_members
  DROP CONSTRAINT IF EXISTS crm_center_members_employment_type_check;

ALTER TABLE crm_center_members
  ADD CONSTRAINT crm_center_members_employment_type_check
  CHECK (employment_type IS NULL OR employment_type IN ('regular','freelance','part_time'));

-- 2) 모든 기존 센터에 "아르바이트", "FC" 등급 시드 (중복 방지)
INSERT INTO crm_grades (center_id, base_role, label, is_system, sort_order)
SELECT c.id, b.base_role, b.label, false, b.sort_order
FROM crm_centers c
CROSS JOIN (VALUES
  ('trainer'::TEXT, '아르바이트'::TEXT, 10),
  ('trainer'::TEXT, 'FC'::TEXT,         11)
) AS b(base_role, label, sort_order)
ON CONFLICT (center_id, label) DO NOTHING;
