-- 직원 수업료(급여) 설정 이력 — 적용 시작일(effective_from) 기준으로 과거·미래 설정을 분리.
-- 통계·급여 계산은 '수업한 날짜에 유효한 설정'을 쓴다. (설정을 바꿔도 과거 달이 다시 계산되지 않음)
CREATE TABLE IF NOT EXISTS crm_staff_pay_history (
  id                 bigserial PRIMARY KEY,
  center_id          bigint NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  center_member_id   bigint NOT NULL REFERENCES crm_center_members(id) ON DELETE CASCADE,
  effective_from     date   NOT NULL,
  commission_type    text,
  commission_rate    numeric,
  commission_tiers   jsonb,
  base_salary        integer,
  cash_pay_enabled   boolean,
  cash_pay_won       integer,
  commission_bonuses jsonb,
  note               text,
  created_by_uid     text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (center_member_id, effective_from)
);
CREATE INDEX IF NOT EXISTS idx_crm_staff_pay_history_member
  ON crm_staff_pay_history (center_id, center_member_id, effective_from);

-- 기준 버전: 이력 도입 시점의 현재 설정을 과거 전체(2000-01-01~)에 적용.
-- (2026-09-15 사용자 결정: 이미 바뀐 과거 설정은 복원하지 않음)
INSERT INTO crm_staff_pay_history
  (center_id, center_member_id, effective_from, commission_type, commission_rate, commission_tiers,
   base_salary, cash_pay_enabled, cash_pay_won, commission_bonuses, note)
SELECT center_id, id, DATE '2000-01-01', commission_type, commission_rate, commission_tiers,
       base_salary, cash_pay_enabled, cash_pay_won, commission_bonuses, '이력 도입 시점 설정(기준)'
FROM crm_center_members
ON CONFLICT (center_member_id, effective_from) DO NOTHING;
