-- CRM: 결제 수단 옵션 단순화
--
-- 2026-06-16 사용자 결정:
--   기존 5개 (cash/card/transfer/custom/etc) → 4개 (cash/card/transfer/etc)
--   "직접입력"은 별도 옵션 대신 "기타" 선택 시 텍스트 입력으로 통합
--
-- 마이그레이션:
--   1) 기존 CHECK 제약 제거
--   2) payment_method='custom' row 를 'etc' 로 변환 (payment_method_custom 텍스트는 보존)
--   3) 새 CHECK 제약 적용

ALTER TABLE crm_passes
  DROP CONSTRAINT IF EXISTS crm_passes_payment_method_check;

UPDATE crm_passes SET payment_method = 'etc' WHERE payment_method = 'custom';

ALTER TABLE crm_passes
  ADD CONSTRAINT crm_passes_payment_method_check
  CHECK (payment_method IN ('cash','card','transfer','etc'));
