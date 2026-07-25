-- 회원 등록: 연락처(phone) 또는 이메일 중 하나만 있으면 되도록 변경
-- 목적: 이메일로만 등록되는 회원(예: 온라인 클래스, 이메일 위주 소통) 지원.
-- 서버 라우트에서 phone/email 최소 1개는 검증하므로 DB 는 NULL 만 허용.
BEGIN;

ALTER TABLE crm_members ALTER COLUMN phone DROP NOT NULL;

COMMIT;
