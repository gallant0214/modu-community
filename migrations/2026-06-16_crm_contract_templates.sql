-- CRM: 계약서 템플릿
--
-- 센터에서 회원/직원과 체결하는 계약서 양식. 카테고리별로 관리.
--   purchase   = 구매 계약서 (수강권/회원권 등)
--   transfer   = 양도 계약서
--   refund     = 환불 계약서
--   employment = 근로 계약서
--   etc        = 기타 계약서
--
-- 본문(body) 은 텍스트. 추후 리치 에디터 도입 시 HTML 도 그대로 저장.

CREATE TABLE IF NOT EXISTS crm_contract_templates (
  id              BIGSERIAL PRIMARY KEY,
  center_id       BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  category        TEXT NOT NULL CHECK (category IN ('purchase','transfer','refund','employment','etc')),
  title           TEXT NOT NULL,
  body            TEXT NOT NULL DEFAULT '',
  created_by_uid  TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_contract_templates_center
  ON crm_contract_templates (center_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_contract_templates_category
  ON crm_contract_templates (center_id, category, status);


CREATE OR REPLACE FUNCTION crm_contract_templates_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_contract_templates_updated_at ON crm_contract_templates;
CREATE TRIGGER trg_crm_contract_templates_updated_at
  BEFORE UPDATE ON crm_contract_templates
  FOR EACH ROW EXECUTE FUNCTION crm_contract_templates_set_updated_at();
