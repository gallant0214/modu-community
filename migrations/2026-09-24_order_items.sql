-- 묶음 결제 (2026-09-24)
--
-- 지금까지 주문 1건 = 상품 1개였다. 회원권을 사면서 운동복을 같이 담을 수 있게
-- 주문 아래에 항목을 둔다. 결제(PG)는 한 번, 발급과 환불은 항목 단위다.
--
-- 락커는 온라인 판매에서 뺀다(사용자 확정) — 남은 자리가 탈의실 기준 5~7개뿐이라
-- 돈을 받고도 줄 자리가 없는 상황이 생긴다.

CREATE TABLE IF NOT EXISTS crm_order_items (
  id             bigserial PRIMARY KEY,
  order_id       bigint NOT NULL REFERENCES crm_orders(id) ON DELETE CASCADE,
  center_id      bigint NOT NULL,
  member_id      bigint NOT NULL,

  product_id     bigint,
  -- 주문 시점 스냅샷 (상품이 나중에 바뀌거나 지워져도 내역은 그대로)
  product_name   text NOT NULL,
  product_type   text NOT NULL,

  list_price_won      integer NOT NULL DEFAULT 0,  -- 정가
  coupon_discount_won integer NOT NULL DEFAULT 0,  -- 이 항목에 배분된 쿠폰 할인
  mileage_used        integer NOT NULL DEFAULT 0,  -- 이 항목에 배분된 마일리지
  mileage_earned      integer NOT NULL DEFAULT 0,
  amount_won          integer NOT NULL DEFAULT 0 CHECK (amount_won >= 0), -- 항목 실결제액

  -- 발급 결과
  issued_kind    text,
  issued_id      bigint,
  payment_id     bigint,      -- 이 항목의 결제원장 (항목별 환불이 가능한 이유)

  -- 항목별 환불
  refunded_at    timestamptz,
  refund_amount  integer,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order  ON crm_order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_member ON crm_order_items (center_id, member_id, created_at DESC);

-- 결제원장을 항목에 연결한다. 주문 1건에 원장이 여러 개가 되므로
-- 기존의 order_id 유니크(이중 발급 방어선)를 항목 단위로 옮긴다.
ALTER TABLE crm_payments ADD COLUMN IF NOT EXISTS order_item_id bigint;
DROP INDEX IF EXISTS uniq_crm_payments_order;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_crm_payments_order_item
  ON crm_payments (order_item_id) WHERE order_item_id IS NOT NULL;

-- 항목이 하나뿐인 과거 주문도 같은 구조로 맞춘다 (화면·환불 로직이 한 갈래로 돌도록)
INSERT INTO crm_order_items
  (order_id, center_id, member_id, product_id, product_name, product_type,
   list_price_won, coupon_discount_won, mileage_used, mileage_earned, amount_won,
   issued_kind, issued_id, payment_id, refunded_at, refund_amount, created_at)
SELECT o.id, o.center_id, o.member_id, o.product_id, o.product_name, o.product_type,
       o.list_price_won, o.coupon_discount_won, o.mileage_used, o.mileage_earned, o.amount_won,
       o.issued_kind, o.issued_id, o.payment_id, o.refunded_at, o.refund_amount, o.created_at
  FROM crm_orders o
 WHERE NOT EXISTS (SELECT 1 FROM crm_order_items i WHERE i.order_id = o.id);

UPDATE crm_payments p SET order_item_id = i.id
  FROM crm_order_items i
 WHERE i.payment_id = p.id AND p.order_item_id IS NULL;
