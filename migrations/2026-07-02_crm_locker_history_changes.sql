-- CRM: 락커 정보 수정 이력을 상세하게 기록
-- update 액션 시 어떤 필드가 어떤 값에서 어떤 값으로 바뀌었는지 기록.
-- 예: { "password": { "from": "0000", "to": "1234" }, "memo": { "from": null, "to": "3층" } }

ALTER TABLE crm_locker_history
  ADD COLUMN IF NOT EXISTS changes JSONB;
