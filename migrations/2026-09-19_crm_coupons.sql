-- CRM 쿠폰: 생성 → 발송(발급) → 사용(발급창 할인) / 회수
--  crm_coupons       쿠폰 '종류'(템플릿) — 혜택·유효기간·조건
--  crm_coupon_sends  발송 기록(배치) — 누가 언제 몇 명에게 어떤 채널로
--  crm_coupon_issues 회원별로 발급된 쿠폰 한 장 — 상태·사용 결제·회수 이력
-- '만료'는 상태로 저장하지 않고 expires_at 으로 계산한다(크론 불필요).

CREATE TABLE IF NOT EXISTS crm_coupons (
  id               bigserial PRIMARY KEY,
  center_id        integer NOT NULL,
  name             text    NOT NULL,
  description      text,
  benefit_type     text    NOT NULL CHECK (benefit_type IN ('amount','percent','gift')),
  amount_won       integer CHECK (amount_won IS NULL OR amount_won > 0),          -- 정액
  percent          numeric(5,2) CHECK (percent IS NULL OR (percent > 0 AND percent <= 100)), -- 정률
  max_discount_won integer CHECK (max_discount_won IS NULL OR max_discount_won > 0), -- 정률 상한
  min_purchase_won integer NOT NULL DEFAULT 0,                                     -- 최소 결제금액
  gift_product_id  integer,                                                        -- 증정 상품
  applicable_types text[],                                  -- 적용 가능 상품 유형(NULL=전체)
  valid_mode       text    NOT NULL DEFAULT 'days' CHECK (valid_mode IN ('days','until')),
  valid_days       integer,                                 -- 발급일로부터 N일
  valid_until      date,                                    -- 고정 만료일
  one_per_member   boolean NOT NULL DEFAULT false,          -- 1인 1장(미사용 보유 중이면 재발급 안 함)
  status           text    NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_by_uid   text,
  created_by_name  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coupons_center ON crm_coupons (center_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS crm_coupon_sends (
  id              bigserial PRIMARY KEY,
  center_id       integer NOT NULL,
  coupon_id       bigint  NOT NULL REFERENCES crm_coupons(id),
  channel         text    NOT NULL CHECK (channel IN ('push','sms','both','none')),
  message         text,
  recipient_count integer NOT NULL DEFAULT 0,   -- 실제 발급된 장수
  skipped_count   integer NOT NULL DEFAULT 0,   -- 1인 1장 규칙으로 건너뛴 수
  push_sent       integer NOT NULL DEFAULT 0,
  sms_sent        integer NOT NULL DEFAULT 0,
  sms_failed      integer NOT NULL DEFAULT 0,
  audience_kind   text,
  audience_filter jsonb,
  sent_by_uid     text,
  sent_by_name    text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coupon_sends_center ON crm_coupon_sends (center_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crm_coupon_issues (
  id                   bigserial PRIMARY KEY,
  center_id            integer NOT NULL,
  coupon_id            bigint  NOT NULL REFERENCES crm_coupons(id),
  member_id            integer NOT NULL,
  send_id              bigint  REFERENCES crm_coupon_sends(id),
  code                 text    NOT NULL UNIQUE,
  status               text    NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','used','revoked')),
  issued_at            timestamptz NOT NULL DEFAULT now(),
  expires_at           date,
  used_at              timestamptz,
  used_by_uid          text,
  used_by_name         text,
  used_ref_kind        text,          -- pass | membership | rental
  used_ref_id          bigint,
  original_price_won   integer,       -- 쿠폰 적용 전 정가
  discount_applied_won integer,       -- 쿠폰으로 깎인 금액
  revoked_at           timestamptz,
  revoked_by_uid       text,
  revoked_by_name      text,
  revoke_reason        text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coupon_issues_member ON crm_coupon_issues (center_id, member_id, status);
CREATE INDEX IF NOT EXISTS idx_coupon_issues_coupon ON crm_coupon_issues (coupon_id, status);
CREATE INDEX IF NOT EXISTS idx_coupon_issues_send   ON crm_coupon_issues (send_id);
CREATE INDEX IF NOT EXISTS idx_coupon_issues_used   ON crm_coupon_issues (center_id, used_at DESC) WHERE status = 'used';
