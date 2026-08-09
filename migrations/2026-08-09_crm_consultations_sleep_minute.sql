-- PT 상담지 취침 시간을 기상 시간과 동일하게 시/분 단위로 저장합니다.
ALTER TABLE crm_pt_consultations
  ADD COLUMN IF NOT EXISTS sleep_minute INTEGER;

ALTER TABLE crm_pt_consultations
  DROP CONSTRAINT IF EXISTS crm_pt_consultations_sleep_minute_check;

ALTER TABLE crm_pt_consultations
  ADD CONSTRAINT crm_pt_consultations_sleep_minute_check
  CHECK (sleep_minute IS NULL OR sleep_minute BETWEEN 0 AND 59);
