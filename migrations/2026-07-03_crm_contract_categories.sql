-- CRM: 계약서 커스텀 카테고리
-- 기본 5종(purchase/transfer/refund/employment/etc) 외에 센터가 필요한 카테고리 자유롭게 추가.
-- crm_contract_templates.category 는 이미 텍스트 컬럼이지만 CHECK 제약이 있었을 가능성 대비 제거.

ALTER TABLE crm_contract_templates
  DROP CONSTRAINT IF EXISTS crm_contract_templates_category_check;

CREATE TABLE IF NOT EXISTS crm_contract_categories (
  id          BIGSERIAL PRIMARY KEY,
  center_id   BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  label       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 100,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (center_id, key)
);

CREATE INDEX IF NOT EXISTS idx_crm_contract_categories_center
  ON crm_contract_categories (center_id, status, sort_order);
