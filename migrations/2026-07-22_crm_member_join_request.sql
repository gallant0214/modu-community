-- 강사 센터 가입 요청/승인 흐름
--
-- 배경: 기존 centers/join 은 강사를 status='active' 로 즉시 가입시켰다.
-- 변경: 앱에서 가입 요청 시 status='pending' 으로 대기 → 센터장이 직원관리에서 수락(active)/거절(rejected).
--
-- status 확장:
--   active    = 정상 근무
--   inactive  = 퇴사
--   pending   = 가입 승인 대기 (앱 요청)                [신규]
--   rejected  = 가입 거절                                [신규]

BEGIN;

ALTER TABLE crm_center_members
  DROP CONSTRAINT IF EXISTS crm_center_members_status_check;
ALTER TABLE crm_center_members
  ADD CONSTRAINT crm_center_members_status_check
  CHECK (status IN ('active', 'inactive', 'pending', 'rejected'));

-- 가입 요청 시각 (요청 순 정렬용)
ALTER TABLE crm_center_members
  ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ;

-- 센터별 대기중 요청 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_crm_center_members_pending
  ON crm_center_members (center_id, status)
  WHERE status = 'pending';

COMMIT;
