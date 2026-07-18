-- 홀딩 대상에 대여권(crm_rentals) 추가
ALTER TABLE crm_pauses  ADD COLUMN IF NOT EXISTS rental_id bigint;
ALTER TABLE crm_rentals ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false;
