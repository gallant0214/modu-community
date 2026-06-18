-- CRM: 헬스장 기간형 회원권 (출입권)
--
-- 수강권(crm_passes)이 PT 횟수권이라면, 회원권은 헬스장 출입 기간권.
-- 결제·만료·환불 흐름은 수강권과 동일하나 횟수 개념 없음.

CREATE TABLE IF NOT EXISTS crm_memberships (
  id                    BIGSERIAL PRIMARY KEY,
  center_id             BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  member_id             BIGINT NOT NULL REFERENCES crm_members(id) ON DELETE CASCADE,

  seller_member_id      BIGINT REFERENCES crm_center_members(id),

  plan_name             TEXT NOT NULL,                              -- "1개월 헬스 이용권" 등
  duration_days         INTEGER NOT NULL CHECK (duration_days > 0),
  price_won             INTEGER NOT NULL DEFAULT 0 CHECK (price_won >= 0),
  vat_included          BOOLEAN NOT NULL DEFAULT false,

  payment_method        TEXT NOT NULL DEFAULT 'custom'
                        CHECK (payment_method IN ('cash','card','transfer','etc')),
  payment_method_custom TEXT,

  start_date            DATE NOT NULL,
  expires_at            DATE NOT NULL,
  status                TEXT NOT NULL DEFAULT 'valid'
                        CHECK (status IN ('valid','expired','refunded','deleted')),
  memo                  TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (expires_at >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_crm_memberships_center_list
  ON crm_memberships (center_id, status, start_date DESC);

CREATE INDEX IF NOT EXISTS idx_crm_memberships_member
  ON crm_memberships (member_id, status, start_date DESC);

CREATE INDEX IF NOT EXISTS idx_crm_memberships_expires
  ON crm_memberships (center_id, status, expires_at);


CREATE OR REPLACE FUNCTION crm_memberships_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_memberships_updated_at ON crm_memberships;
CREATE TRIGGER trg_crm_memberships_updated_at
  BEFORE UPDATE ON crm_memberships
  FOR EACH ROW EXECUTE FUNCTION crm_memberships_set_updated_at();
