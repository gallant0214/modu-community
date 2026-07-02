-- CRM: 센터별 커스텀 상품 유형
--
-- 기본 6종(회원권/그룹수업/개인레슨/락커/운동복/운동용품) 외에
-- 각 센터가 필요한 유형을 자유롭게 추가/삭제할 수 있게 한다.
-- crm_products.type 의 CHECK 제약을 풀고, 커스텀 유형은 crm_product_types 에서 관리.

ALTER TABLE crm_products
  DROP CONSTRAINT IF EXISTS crm_products_type_check;

CREATE TABLE IF NOT EXISTS crm_product_types (
  id            BIGSERIAL PRIMARY KEY,
  center_id     BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  key           TEXT NOT NULL,
  label         TEXT NOT NULL,
  color         TEXT,                                    -- hex 색상 (선택)
  sort_order    INTEGER NOT NULL DEFAULT 100,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','inactive')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (center_id, key)
);

CREATE INDEX IF NOT EXISTS idx_crm_product_types_center
  ON crm_product_types (center_id, status, sort_order);

CREATE OR REPLACE FUNCTION crm_product_types_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_product_types_updated_at ON crm_product_types;
CREATE TRIGGER trg_crm_product_types_updated_at
  BEFORE UPDATE ON crm_product_types
  FOR EACH ROW EXECUTE FUNCTION crm_product_types_set_updated_at();
