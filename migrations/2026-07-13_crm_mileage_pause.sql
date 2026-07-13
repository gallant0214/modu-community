-- 상품: 구매 시 적립 마일리지 + 마일리지 사용 허용 + 홀딩 가능 횟수
ALTER TABLE crm_products ADD COLUMN IF NOT EXISTS mileage_earn integer NOT NULL DEFAULT 0;
ALTER TABLE crm_products ADD COLUMN IF NOT EXISTS mileage_usable boolean NOT NULL DEFAULT true;
ALTER TABLE crm_products ADD COLUMN IF NOT EXISTS pause_count integer NOT NULL DEFAULT 0;
-- 발급 기록: 적립/사용 마일리지 (결제 상세 표시)
ALTER TABLE crm_memberships ADD COLUMN IF NOT EXISTS mileage_earned integer NOT NULL DEFAULT 0;
ALTER TABLE crm_memberships ADD COLUMN IF NOT EXISTS mileage_used integer NOT NULL DEFAULT 0;
ALTER TABLE crm_rentals ADD COLUMN IF NOT EXISTS mileage_earned integer NOT NULL DEFAULT 0;
ALTER TABLE crm_rentals ADD COLUMN IF NOT EXISTS mileage_used integer NOT NULL DEFAULT 0;
