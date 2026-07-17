-- 회원권 실제 구매일. 기존(POS 변환분 포함)은 start_date 로 백필.
-- created_at 은 CRM 기록 생성시각(POS 변환분은 임포트일)이라 구매일로 부적합.
ALTER TABLE crm_memberships ADD COLUMN IF NOT EXISTS purchased_at date;

UPDATE crm_memberships
   SET purchased_at = start_date
 WHERE purchased_at IS NULL;

ALTER TABLE crm_memberships ALTER COLUMN purchased_at SET DEFAULT CURRENT_DATE;
