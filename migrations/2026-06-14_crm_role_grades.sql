-- CRM 모듈 #6: role 4단계 등급 확장
--
-- 2026-06-14 사용자 결정 ([[feedback-crm-data-isolation]]):
--   기존: 'center_owner' | 'trainer'  → 신규: 'owner' | 'admin' | 'manager' | 'trainer'
--
-- 등급별 디폴트 접근:
--   owner    — 대표자, 무조건 전체 (센터 owner_uid)
--   admin    — 관리자, 디폴트 전체 (사장이 토글로 제한 가능)
--   manager  — 팀장, 본인 팀 + 본인 (팀 개념은 추후 crm_teams 테이블)
--   trainer  — 강사, 본인 데이터만, 디폴트 스케줄 중심
--
-- 멱등 마이그레이션:
--   1) 기존 CHECK 제약 제거
--   2) 기존 데이터 'center_owner' → 'owner' UPDATE
--   3) 새 CHECK 제약 적용

ALTER TABLE crm_center_members
  DROP CONSTRAINT IF EXISTS crm_center_members_role_check;

UPDATE crm_center_members SET role = 'owner' WHERE role = 'center_owner';

ALTER TABLE crm_center_members
  ADD CONSTRAINT crm_center_members_role_check
  CHECK (role IN ('owner','admin','manager','trainer'));
