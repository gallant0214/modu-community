-- CRM: 수강권에 시작일(start_date) 분리
-- issued_at 은 발급일(결제/발급 처리한 날),
-- start_date 는 실제 사용 시작일(회원이 첫 수업 시작).
-- 기존 데이터는 issued_at 을 그대로 시작일로 백필.

ALTER TABLE crm_passes
  ADD COLUMN IF NOT EXISTS start_date DATE;

UPDATE crm_passes
  SET start_date = issued_at
  WHERE start_date IS NULL;

ALTER TABLE crm_passes
  ALTER COLUMN start_date SET NOT NULL;

-- 종료일이 시작일보다 앞설 수 없음
ALTER TABLE crm_passes
  DROP CONSTRAINT IF EXISTS crm_passes_expires_after_start_check;
ALTER TABLE crm_passes
  ADD CONSTRAINT crm_passes_expires_after_start_check
  CHECK (expires_at >= start_date);
