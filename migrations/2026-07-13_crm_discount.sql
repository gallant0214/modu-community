-- 결제 상세: 할인 금액. price_won = 실제 결제 금액, discount_won = 할인액(정가 = price_won + discount_won)
ALTER TABLE crm_memberships ADD COLUMN IF NOT EXISTS discount_won integer NOT NULL DEFAULT 0;
ALTER TABLE crm_rentals ADD COLUMN IF NOT EXISTS discount_won integer NOT NULL DEFAULT 0;
