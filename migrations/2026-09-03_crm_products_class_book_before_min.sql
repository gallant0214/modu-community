-- 클래스 상품: 예약 마감 시간(수업 시작 N분 전까지만 예약 가능)
-- 예) 60 → 11:00 수업은 10:00 까지 예약 가능, 10:01 부터 예약 불가
-- 0 = 수업 시작 직전까지 예약 가능 (기존 동작 유지)
ALTER TABLE crm_products
  ADD COLUMN IF NOT EXISTS class_book_before_min integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN crm_products.class_book_before_min IS '클래스 예약 마감: 수업 시작 N분 전까지만 예약 가능 (0=시작 직전까지)';
