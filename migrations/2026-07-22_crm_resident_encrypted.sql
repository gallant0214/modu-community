-- CRM 직원 주민번호 암호화 저장 컬럼 추가
-- ============================================
-- 목적: 기존 resident_hash 는 본인 확인용(단방향 해시)이라 원본 조회 불가.
-- 사용자가 눈 아이콘 클릭 시 원본을 표시하려면 서버에 복호화 가능한 형태로도
-- 저장해야 함. AES-256-GCM 으로 앱 레벨에서 암호화한 바이너리 저장.
--
-- 조회 정책: 본인 + 대표자(owner) 만. 조회 시 crm_audit_logs 에 기록.
-- 환경변수: RESIDENT_ENC_KEY (32 byte hex, 즉 64 문자)
-- ============================================

BEGIN;

ALTER TABLE crm_center_members
  ADD COLUMN IF NOT EXISTS resident_encrypted bytea;

COMMENT ON COLUMN crm_center_members.resident_encrypted IS
  'AES-256-GCM 암호화된 주민번호 원문 (앱 레벨 암호화). 형식: iv(12) || ciphertext || authTag(16). 조회 권한은 본인/대표자.';

COMMIT;
