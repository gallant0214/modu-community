-- 앱 퇴실 시 마일리지 적립 (센터 설정)
ALTER TABLE crm_center_settings ADD COLUMN IF NOT EXISTS checkout_mileage_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE crm_center_settings ADD COLUMN IF NOT EXISTS checkout_mileage_earn integer NOT NULL DEFAULT 0;
