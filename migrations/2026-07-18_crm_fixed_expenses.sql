-- 센터 고정(정기) 지출: 가게 월세, 관리비, 기타 정기 결제 등
CREATE TABLE IF NOT EXISTS crm_fixed_expenses (
  id           bigserial PRIMARY KEY,
  center_id    bigint  NOT NULL,
  label        text    NOT NULL,               -- 항목명 (예: 가게 월세, 관리비)
  amount_won   integer NOT NULL DEFAULT 0,     -- 월 지출 금액(원)
  billing_day  smallint,                       -- 매월 결제일 (1~31, 선택)
  memo         text,
  sort_order   integer NOT NULL DEFAULT 100,
  status       text    NOT NULL DEFAULT 'active',  -- active | inactive(soft delete)
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_fixed_expenses_center ON crm_fixed_expenses(center_id, status);
