-- resident_encrypted 컬럼 타입을 bytea → text (hex 문자열) 로 변경
-- 이유: supabase-js REST API 를 통해 bytea 저장 시 이스케이프 이슈로 실패.
-- hex 문자열 저장이 더 단순하고 안정적. 크기 부담 무시할 수준(~120자).
BEGIN;

ALTER TABLE crm_center_members
  ALTER COLUMN resident_encrypted TYPE text
  USING CASE WHEN resident_encrypted IS NULL THEN NULL ELSE encode(resident_encrypted, 'hex') END;

COMMENT ON COLUMN crm_center_members.resident_encrypted IS
  'AES-256-GCM 암호화된 주민번호 원문 (hex 문자열). 형식: iv(12) || ciphertext || authTag(16) 을 hex 인코딩. 조회 권한은 본인/대표자.';

COMMIT;
