-- 온라인 결제(PG) 2차 — 쿠폰·마일리지 적용 + 웹 채널 + 환불 추적
--  · 주문 1건 = 상품 1개. 할인 내역은 주문 행에 그대로 남긴다(영수증·환불 계산의 근거).
--  · 금액은 전부 서버가 확정한다. 클라이언트 값은 어디서도 신뢰하지 않는다.

/* ── 주문: 할인 내역 · 채널 · 만료 · 환불 ───────────────────── */
ALTER TABLE crm_orders
  ADD COLUMN IF NOT EXISTS channel             text    NOT NULL DEFAULT 'app',  -- app | web
  ADD COLUMN IF NOT EXISTS list_price_won      integer NOT NULL DEFAULT 0,      -- 할인 전 정가
  ADD COLUMN IF NOT EXISTS coupon_issue_id     bigint,                          -- crm_coupon_issues.id
  ADD COLUMN IF NOT EXISTS coupon_discount_won integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mileage_used        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mileage_earned      integer NOT NULL DEFAULT 0,      -- 구매 적립(발급 시 지급)
  ADD COLUMN IF NOT EXISTS expires_at          timestamptz,                     -- pending 주문 유효시한
  ADD COLUMN IF NOT EXISTS refunded_at         timestamptz,
  ADD COLUMN IF NOT EXISTS refund_amount       integer,
  ADD COLUMN IF NOT EXISTS refund_reason       text;

-- amount_won(최종 결제액)은 0원일 수 있다: 증정 쿠폰·마일리지 전액 결제 → PG 미경유 발급
ALTER TABLE crm_orders DROP CONSTRAINT IF EXISTS crm_orders_amount_won_check;
ALTER TABLE crm_orders ADD  CONSTRAINT crm_orders_amount_won_check CHECK (amount_won >= 0);

-- 같은 쿠폰이 두 주문에 동시에 물리지 않도록 — 살아있는 주문에만 적용되는 부분 유니크
CREATE UNIQUE INDEX IF NOT EXISTS uniq_orders_coupon_live
  ON crm_orders (coupon_issue_id)
  WHERE coupon_issue_id IS NOT NULL AND status IN ('pending', 'paid');

-- 만료 정리 크론이 훑는 인덱스
CREATE INDEX IF NOT EXISTS idx_orders_pending_expiry
  ON crm_orders (expires_at) WHERE status = 'pending';

/* ── 수강권도 마일리지 기록 가능하게 (회원권·대여권과 스키마 통일) ── */
ALTER TABLE crm_passes
  ADD COLUMN IF NOT EXISTS mileage_earned integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mileage_used   integer NOT NULL DEFAULT 0;

/* ── 결제 원장: 발급물 없는 판매(물품)도 기록할 수 있게 ──────────
   기존 제약은 pass/membership/rental 중 정확히 1개를 강제해서
   물품 주문의 원장 INSERT 가 실패했다. order_id 가 있으면 0개도 허용한다. */
ALTER TABLE crm_payments DROP CONSTRAINT IF EXISTS crm_payments_check;
ALTER TABLE crm_payments ADD  CONSTRAINT crm_payments_check CHECK (
  ((pass_id IS NOT NULL)::integer + (membership_id IS NOT NULL)::integer + (rental_id IS NOT NULL)::integer) = 1
  OR order_id IS NOT NULL
);

/* ── PG 웹훅 수신 기록 (중복·누락 추적) ───────────────────────── */
CREATE TABLE IF NOT EXISTS crm_pg_webhook_logs (
  id          bigserial PRIMARY KEY,
  provider    text NOT NULL DEFAULT 'toss',
  event_type  text,
  payment_key text,
  order_uid   text,
  handled     boolean NOT NULL DEFAULT false,
  note        text,
  raw         jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pg_webhook_order ON crm_pg_webhook_logs (order_uid, received_at DESC);

/* ── 판매 페이지 필수 표기 (전자상거래법 · PG 심사 항목) ────── */
ALTER TABLE crm_centers
  ADD COLUMN IF NOT EXISTS mail_order_no  text,   -- 통신판매업 신고번호
  ADD COLUMN IF NOT EXISTS support_email  text,   -- 고객 문의 이메일
  ADD COLUMN IF NOT EXISTS refund_policy  text;   -- 환불·해지 규정 (판매 페이지에 노출)

/* ── 센터별 공개 판매 페이지 주소 /shop/[slug] ──────────────
   추측이 어려운 랜덤 문자열. 센터가 늘어나도 주소가 겹치지 않는다. */
ALTER TABLE crm_centers ADD COLUMN IF NOT EXISTS shop_slug text;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_crm_centers_shop_slug
  ON crm_centers (shop_slug) WHERE shop_slug IS NOT NULL;

/* ── 온라인 판매 스위치 (상품별) ─────────────────────────────
   🚨 sale_enabled(직원 발급창 판매 여부)와 **별개 컬럼**이다.
   기본값 false — 센터가 온라인에 올릴 상품만 명시적으로 켠다.
   같이 쓰면 테스트 상품·직원 단가·바우처 상품이 전부 홈페이지에 노출된다. */
ALTER TABLE crm_products
  ADD COLUMN IF NOT EXISTS online_sale_enabled boolean NOT NULL DEFAULT false;

/* ── 온라인 구매 자격 (상품별) ───────────────────────────────
   현장에서는 직원이 신규·재등록을 보고 발급하지만 온라인은 확인하는 사람이 없다.
   서버가 crm_members.registration_type 과 대조해 막는다.
     any    누구나
     new    신규 회원만
     rejoin 재등록 회원만                                      */
ALTER TABLE crm_products
  ADD COLUMN IF NOT EXISTS online_eligibility text NOT NULL DEFAULT 'any';
ALTER TABLE crm_products DROP CONSTRAINT IF EXISTS crm_products_online_eligibility_check;
ALTER TABLE crm_products ADD  CONSTRAINT crm_products_online_eligibility_check
  CHECK (online_eligibility IN ('any', 'new', 'rejoin'));
