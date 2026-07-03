-- CRM: 서명 요청 링크(토큰) 기능
-- 관리자가 요청 링크를 만들어 회원에게 전달 → 회원이 링크로 접속해 서명 → 완료.
-- 현재 앱 출시 전엔 링크를 SMS/카톡 등으로 붙여넣어 보냄.

ALTER TABLE crm_signed_contracts
  ADD COLUMN IF NOT EXISTS signing_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ;

-- status 에 pending_signature 추가.
ALTER TABLE crm_signed_contracts
  DROP CONSTRAINT IF EXISTS crm_signed_contracts_status_check;
ALTER TABLE crm_signed_contracts
  ADD CONSTRAINT crm_signed_contracts_status_check
  CHECK (status IN ('pending_signature','signed','voided'));

CREATE INDEX IF NOT EXISTS idx_crm_signed_contracts_token
  ON crm_signed_contracts (signing_token) WHERE signing_token IS NOT NULL;
