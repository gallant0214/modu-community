-- 회원앱 상품 구매(일회성 결제)
--  · 금액·상품은 서버가 확정한다(앱이 보낸 금액을 절대 믿지 않음)
--  · PG 승인은 서버가 PG 서버에 직접 확인한 뒤에만 발급한다

CREATE TABLE IF NOT EXISTS crm_orders (
  id             bigserial PRIMARY KEY,
  center_id      integer NOT NULL,
  member_id      integer NOT NULL,
  product_id     integer,

  -- 주문 시점 스냅샷 (상품이 나중에 바뀌어도 주문 내역은 그대로)
  product_name   text NOT NULL,
  product_type   text NOT NULL,
  amount_won     integer NOT NULL CHECK (amount_won >= 0),

  status         text NOT NULL DEFAULT 'pending',   -- pending|paid|failed|canceled|refunded
  order_uid      text NOT NULL UNIQUE,              -- PG 에 넘기는 주문번호
  pg_provider    text NOT NULL DEFAULT 'toss',
  pg_payment_key text,
  pg_approved_at timestamptz,
  pg_method      text,                              -- 카드/간편결제 등 PG 가 알려준 수단
  pg_receipt_url text,
  pg_raw         jsonb,
  fail_reason    text,

  -- 발급 결과 (멱등 처리: 이미 발급됐으면 재발급하지 않음)
  issued_kind    text,                              -- pass|membership|rental|locker|bundle
  issued_id      bigint,
  issued_extra   jsonb,                             -- 묶음 상품처럼 여러 건 발급된 경우
  payment_id     bigint,                            -- crm_payments.id

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_center_member ON crm_orders (center_id, member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status        ON crm_orders (center_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_paymentkey    ON crm_orders (pg_payment_key);

-- 결제 원장에도 앱 결제임을 남긴다 (CRM 결제내역에서 구분해 보이도록)
ALTER TABLE crm_payments
  ADD COLUMN IF NOT EXISTS order_id bigint,
  ADD COLUMN IF NOT EXISTS source   text NOT NULL DEFAULT 'staff';  -- staff | member_app
