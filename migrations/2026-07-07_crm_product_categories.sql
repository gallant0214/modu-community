-- CRM: 상품 종류(카테고리) 센터별 설정
-- 상품 추가 시 "종류" 드롭다운 소스. 예: 헬스, PT, 필라테스, 요가, GX

CREATE TABLE IF NOT EXISTS crm_product_categories (
  id          BIGSERIAL PRIMARY KEY,
  center_id   BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 100,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (center_id, label)
);

CREATE INDEX IF NOT EXISTS idx_crm_product_categories_center
  ON crm_product_categories (center_id, status, sort_order);
