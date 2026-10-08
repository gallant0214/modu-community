-- 모두의지도사가 사장님에게 센터 CRM 이용권을 판다 (2026-10-08)
--
-- 왜 별도 테이블인가:
--   체육시설 이용권 판매가 PG 두 곳에서 업종 차단으로 거절돼(토스 2026-10-06,
--   NHN한국사이버결제 2026-10-08) 파는 물건을 'CRM 월 구독 소프트웨어' 로 바꿨다.
--   기존 crm_orders 는 "센터가 자기 회원에게 판다" 는 전제라 center_id·member_id 가
--   둘 다 NOT NULL 이고, 센터 매출 통계·정산이 그 테이블을 집계한다.
--   우리 SaaS 매출을 거기 섞으면 센터 장부가 틀어진다. 그래서 완전히 분리한다.

/* ── 주문: 사장님 1명이 1개월 이용권을 1건 산다 ───────────────── */
CREATE TABLE IF NOT EXISTS saas_orders (
  id              bigserial PRIMARY KEY,
  -- 'sa_' 접두사. 🚨 포트원 웹훅이 접두사로 crm_orders(mo_) 와 가른다
  order_uid       text NOT NULL UNIQUE,
  firebase_uid    text NOT NULL,                        -- 구매자(사장님)
  center_id       bigint NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,

  -- 요금제 스냅샷. 나중에 가격이 바뀌어도 과거 주문의 근거가 남아야 한다
  plan_code       text NOT NULL,
  plan_name       text NOT NULL,
  period_months   integer NOT NULL CHECK (period_months > 0),
  amount_won      integer NOT NULL CHECK (amount_won >= 0),

  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','processing','paid','failed','canceled','refunded')),
  -- pending 주문 유효시한(30분). crm_orders 와 같은 의미·같은 이름
  expires_at      timestamptz,
  fail_reason     text,

  pg_provider     text NOT NULL DEFAULT 'portone',
  pg_payment_key  text,                                 -- 포트원 imp_uid
  pg_approved_at  timestamptz,
  pg_method       text,
  pg_receipt_url  text,
  pg_raw          jsonb,

  refunded_at     timestamptz,
  refund_amount   integer,
  refund_reason   text,

  subscription_id bigint,                               -- 이 결제로 만들어진/연장된 구독
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 한 센터에 살아있는 pending 주문은 1개만 — 결제창을 두 번 열어 두 번 결제하는 걸 막는다
CREATE UNIQUE INDEX IF NOT EXISTS uniq_saas_orders_pending_center
  ON saas_orders (center_id)
  WHERE status IN ('pending','processing');

CREATE INDEX IF NOT EXISTS idx_saas_orders_uid ON saas_orders (firebase_uid, created_at DESC);
-- 만료 정리가 훑는 인덱스
CREATE INDEX IF NOT EXISTS idx_saas_orders_pending_expiry
  ON saas_orders (expires_at) WHERE status = 'pending';


/* ── 구독: 센터가 CRM 을 쓸 수 있는 기간 ──────────────────────── */
CREATE TABLE IF NOT EXISTS saas_subscriptions (
  id            bigserial PRIMARY KEY,
  center_id     bigint NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  firebase_uid  text NOT NULL,                          -- 결제 주체(사장님)
  plan_code     text NOT NULL,

  status        text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','expired','canceled')),

  started_on    date NOT NULL,
  /* 🚨 CRM 접근 판정의 유일한 근거. **그날까지 포함**해서 유효하다.
     이름이 expires_at 이 아니라 expires_on 인 이유: 위 saas_orders.expires_at 은
     'pending 주문이 죽는 시각(timestamptz)' 이라 뜻이 전혀 다르다.
     한 마이그레이션 안에 같은 이름으로 두면 반드시 혼동한다.
     date 로 둔 건 crm_memberships 등 기존 이용권과 같은 방식(KST 날짜, 당일 포함)이라
     읽을 때마다 시간대 계산을 하지 않아도 되기 때문이다. */
  expires_on    date NOT NULL,

  /* 정기결제(자동결제) 심사 통과 후 채운다 — 포트원 customer_uid.
     지금 심사 중인 건 신용카드 '일반결제' 뿐이라 1차에는 비어 있다.
     미리 넣어둬서 2차에 마이그레이션이 또 필요하지 않게 한다. */
  billing_key   text,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 센터당 살아있는 구독은 1개. 연장은 새 행이 아니라 이 행의 expires_on 을 늘린다
CREATE UNIQUE INDEX IF NOT EXISTS uniq_saas_sub_center_active
  ON saas_subscriptions (center_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_saas_sub_expiry
  ON saas_subscriptions (expires_on) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_saas_sub_uid ON saas_subscriptions (firebase_uid);
