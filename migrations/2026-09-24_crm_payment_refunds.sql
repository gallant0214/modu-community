-- 환불 이력 (2026-09-24)
--
-- 왜 별도 테이블인가:
--   결제내역은 원장이다. 결제 행의 status 만 바꾸면 "결제했다"는 사실이 사라지고
--   최종 상태만 남아, 언제 얼마가 어떻게 돌아갔는지 알 수 없다.
--   결제 이벤트와 환불 이벤트를 각각 남긴다.
--
-- 정산에는 영향 없다: 매출은 상품 행(회원권·수강권·대여권)의 price_won 으로 계산되고
-- 카드수수료는 crm_payments.status='completed' 만 본다. 이 테이블은 표시·추적용이다.

CREATE TABLE IF NOT EXISTS crm_payment_refunds (
  id          bigserial PRIMARY KEY,
  center_id   bigint NOT NULL,
  member_id   bigint NOT NULL,

  -- 원 결제. 결제원장이 삭제돼도 환불 사실은 남아야 한다 → SET NULL
  payment_id  bigint REFERENCES crm_payments(id) ON DELETE SET NULL,
  order_id    bigint,                       -- 온라인 주문(crm_orders.id)

  amount_won  integer NOT NULL CHECK (amount_won >= 0),
  refunded_at timestamptz NOT NULL DEFAULT now(),

  -- pg     = PG(토스)에서 취소됨. 실제 대금이 회원에게 돌아갔다
  -- center = 센터가 장부상 처리. PG 대금은 별도 확인 필요
  source     text NOT NULL CHECK (source IN ('pg', 'center')),
  provider   text,                          -- toss (source=pg)
  is_partial boolean NOT NULL DEFAULT false,
  reason     text,
  actor_uid  text,                          -- 센터 환불 시 처리한 직원

  -- PG 취소 건의 멱등 키. 웹훅이 여러 번 와도 한 번만 기록된다
  pg_transaction_key text,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_refunds_member
  ON crm_payment_refunds (center_id, member_id, refunded_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment
  ON crm_payment_refunds (payment_id);
-- 🚨 부분 인덱스(WHERE ... IS NOT NULL)로 만들면 안 된다.
--    PostgREST 의 onConflict 가 부분 인덱스를 찾지 못해 upsert 가 통째로 실패한다.
--    Postgres 는 NULL 을 서로 다른 값으로 보므로 부분 조건 없이도 NULL 은 여러 개 들어간다.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_payment_refunds_pg_tx
  ON crm_payment_refunds (pg_transaction_key);
