-- CRM: 직원 인사 정보 컬럼 추가
--
-- crm_center_members 에 사용자 요청 필드 추가:
--   address           = 주소
--   employment_status = 재직상태 (working / on_leave / resigned)
--   employment_type   = 근무형태 (regular / freelance)
--
-- 기존 status (active/inactive) 는 CRM 시스템 접근 권한 게이트.
-- 새 employment_status 는 인사 정보 표시용. 두 가지를 분리.
--   - inactive = CRM 접근 차단 (퇴사)
--   - active   = CRM 접근 가능 (재직중·휴직 등)
-- 화면에서는 employment_status 우선 표시.

ALTER TABLE crm_center_members
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS employment_status TEXT NOT NULL DEFAULT 'working'
    CHECK (employment_status IN ('working','on_leave','resigned')),
  ADD COLUMN IF NOT EXISTS employment_type TEXT
    CHECK (employment_type IN ('regular','freelance'));

-- 기존 row 백필: status='inactive' 면 employment_status='resigned'
UPDATE crm_center_members
SET employment_status = 'resigned'
WHERE status = 'inactive' AND employment_status = 'working';
