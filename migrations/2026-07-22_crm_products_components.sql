-- 묶음(번들) 상품: 하나의 상품에 여러 구성 상품을 담아 함께 판매.
-- components 가 비어있지 않으면 묶음 상품. 발급 시 각 구성 항목을 함께 발급.
ALTER TABLE crm_products ADD COLUMN IF NOT EXISTS components jsonb NOT NULL DEFAULT '[]'::jsonb;
