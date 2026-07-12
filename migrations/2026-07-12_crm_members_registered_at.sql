-- crm_members.registered_at: 실제 최초 등록일(POS 최초 등록일). created_at 은 CRM 레코드 생성 시각(임포트일)이라 별도 보관.
-- 2026-07-12: POS 고객목록 CSV 의 '최초 등록일' 을 전화번호(digits) 매칭으로 백필. 스페셜바디 2,573명.
ALTER TABLE crm_members ADD COLUMN IF NOT EXISTS registered_at date;
-- 백필 데이터는 scratchpad 04_registered_at.sql 참고 (전화번호 digits 매칭 UPDATE 2,573건).
