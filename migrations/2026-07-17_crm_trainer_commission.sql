-- 강사별 수업료(정산) 설정: 고정% 또는 매출 구간별%
-- commission_type: 'fixed'(고정%) | 'tiered'(매출 구간별%)
-- commission_rate: 고정% 값 (예: 50 = 50%)
-- commission_tiers: 구간별 [{"upTo": 6000000, "rate": 50}, {"upTo": 10000000, "rate": 60}, {"upTo": null, "rate": 70}]
ALTER TABLE crm_center_members
  ADD COLUMN IF NOT EXISTS commission_type text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS commission_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_tiers jsonb NOT NULL DEFAULT '[]'::jsonb;
-- 고정 급여(월). 총 지급액 = base_salary + 수업료(commission)
ALTER TABLE crm_center_members ADD COLUMN IF NOT EXISTS base_salary integer NOT NULL DEFAULT 0;
