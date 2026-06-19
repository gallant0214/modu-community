-- CRM 상품: 그룹 수업 정원(capacity) 추가
-- type='group' 일 때 한 클래스에 받을 수 있는 인원 수.

ALTER TABLE crm_products
  ADD COLUMN IF NOT EXISTS capacity INTEGER NOT NULL DEFAULT 0
  CHECK (capacity >= 0);
