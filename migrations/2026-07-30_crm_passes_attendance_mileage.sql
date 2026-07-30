-- 수강권(crm_passes)에 출석 시 적립 마일리지 컬럼 추가
-- 상품(crm_products.attendance_mileage_earn) 발급 시점 값이 스냅샷 저장됨
-- 회원 상세 페이지의 '수강권 수정' 에서 변경 가능

ALTER TABLE crm_passes
  ADD COLUMN IF NOT EXISTS attendance_mileage_earn INTEGER NOT NULL DEFAULT 0;
