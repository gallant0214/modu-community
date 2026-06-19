-- CRM 상품 유형에 운동복(apparel) 추가
-- 락커(locker) 와 운동용품(goods) 사이.

ALTER TABLE crm_products
  DROP CONSTRAINT IF EXISTS crm_products_type_check;

ALTER TABLE crm_products
  ADD CONSTRAINT crm_products_type_check
  CHECK (type IN ('membership','group','personal','locker','apparel','goods'));
