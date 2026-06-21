-- CRM: 서명된 전자 계약서
--
-- 회원과 실제로 체결된 계약서 인스턴스. 계약서 템플릿(crm_contract_templates) 과 다름.
-- customer_info / product_info / payment_info / terms_accepted 는 JSONB.
-- signature_data_url 은 PNG base64 (HTML canvas toDataURL).

CREATE TABLE IF NOT EXISTS crm_signed_contracts (
  id                BIGSERIAL PRIMARY KEY,
  center_id         BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  member_id         BIGINT REFERENCES crm_members(id) ON DELETE SET NULL,

  -- 참조 (옵션)
  pass_id           BIGINT REFERENCES crm_passes(id) ON DELETE SET NULL,
  membership_id     BIGINT REFERENCES crm_memberships(id) ON DELETE SET NULL,

  title             TEXT NOT NULL DEFAULT '피티 회원가입 계약서',

  customer_info     JSONB NOT NULL DEFAULT '{}'::jsonb,
  product_info      JSONB NOT NULL DEFAULT '{}'::jsonb,
  payment_info      JSONB NOT NULL DEFAULT '{}'::jsonb,
  terms_accepted    JSONB NOT NULL DEFAULT '{}'::jsonb,
  terms_snapshot    JSONB NOT NULL DEFAULT '{}'::jsonb,  -- 서명 당시 약관 본문 보존

  signature_data_url TEXT,
  signed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  signed_by_uid     TEXT,

  status            TEXT NOT NULL DEFAULT 'signed'
                    CHECK (status IN ('signed','voided')),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_signed_contracts_center
  ON crm_signed_contracts (center_id, signed_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_signed_contracts_member
  ON crm_signed_contracts (member_id, signed_at DESC);

CREATE OR REPLACE FUNCTION crm_signed_contracts_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_signed_contracts_updated_at ON crm_signed_contracts;
CREATE TRIGGER trg_crm_signed_contracts_updated_at
  BEFORE UPDATE ON crm_signed_contracts
  FOR EACH ROW EXECUTE FUNCTION crm_signed_contracts_set_updated_at();
