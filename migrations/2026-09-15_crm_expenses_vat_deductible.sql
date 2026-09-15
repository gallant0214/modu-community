-- 지출에 '세금계산서 받음(매입세액 공제)' 플래그 추가
-- 부가세 = 매출세액 - 매입세액 으로 계산하기 위한 기반. 기본 false(영수증만 받는 항목).
ALTER TABLE crm_fixed_expenses
  ADD COLUMN IF NOT EXISTS vat_deductible boolean NOT NULL DEFAULT false;
ALTER TABLE crm_additional_expenses
  ADD COLUMN IF NOT EXISTS vat_deductible boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN crm_fixed_expenses.vat_deductible IS '세금계산서(매입세액 공제) 대상 여부 — 부가세 계산 시 매입세액으로 차감';
