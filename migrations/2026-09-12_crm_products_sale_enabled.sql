-- 상품 카드 판매 on/off 스위치
-- false 면 회원권·수강권 발급 등 '상품을 고르는' 목록에서 제외된다.
-- (status='inactive' 는 소프트 삭제라 재사용 불가 → 별도 컬럼)
ALTER TABLE crm_products
  ADD COLUMN IF NOT EXISTS sale_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN crm_products.sale_enabled IS '판매 on/off. false 면 회원권·수강권 발급 등 상품 선택 목록에서 제외(상품관리에는 남음). status=inactive 는 삭제이므로 별개';
