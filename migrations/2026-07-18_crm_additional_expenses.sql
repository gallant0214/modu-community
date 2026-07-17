-- 정산용 월별 추가(변동) 지출. 고정 지출과 별개로 그 달에만 발생한 비용.
CREATE TABLE IF NOT EXISTS crm_additional_expenses (
  id          bigserial PRIMARY KEY,
  center_id   bigint  NOT NULL,
  ym          text    NOT NULL,               -- 귀속 월 'YYYY-MM'
  label       text    NOT NULL,               -- 내용 (예: 에어컨 수리, 비품 구매)
  amount_won  integer NOT NULL DEFAULT 0,
  memo        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_additional_expenses_center_ym ON crm_additional_expenses(center_id, ym);
