-- CRM: 상품 카탈로그
--
-- 회원권/그룹수업/개인레슨/락커/운동용품 등 센터에서 판매하는 상품.
-- 발급 시(crm_passes / crm_memberships) 이 카탈로그를 참조하면 가격·기간이 자동 채워짐.

CREATE TABLE IF NOT EXISTS crm_products (
  id              BIGSERIAL PRIMARY KEY,
  center_id       BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,

  type            TEXT NOT NULL
                  CHECK (type IN ('membership','group','personal','locker','goods')),
  billing_mode    TEXT NOT NULL DEFAULT 'period'
                  CHECK (billing_mode IN ('period','count')),
  category        TEXT,                                  -- 헬스, 필라테스, 요가, GX 등 자유 텍스트

  name            TEXT NOT NULL,
  description     TEXT,

  -- 영업시간
  open_time       TIME DEFAULT TIME '00:00',
  close_time      TIME DEFAULT TIME '23:59',
  operating_days  INTEGER[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}', -- 0=일 ... 6=토

  -- 기간형 (period)
  duration_value  INTEGER DEFAULT 0,                     -- 예: 3
  duration_unit   TEXT DEFAULT 'month'                   -- month / day / year
                  CHECK (duration_unit IN ('day','month','year')),
  service_days    INTEGER NOT NULL DEFAULT 0,            -- 보너스 서비스 일수

  -- 횟수형 (count)
  total_sessions  INTEGER DEFAULT 0,

  -- 정지(휴회) 설정
  pause_enabled   BOOLEAN NOT NULL DEFAULT false,
  pause_days      INTEGER NOT NULL DEFAULT 0,

  -- 금액
  price_won       INTEGER NOT NULL DEFAULT 0 CHECK (price_won >= 0),
  vat_included    BOOLEAN NOT NULL DEFAULT false,

  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','inactive')),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_products_center_list
  ON crm_products (center_id, status, type, created_at DESC);

CREATE OR REPLACE FUNCTION crm_products_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_products_updated_at ON crm_products;
CREATE TRIGGER trg_crm_products_updated_at
  BEFORE UPDATE ON crm_products
  FOR EACH ROW EXECUTE FUNCTION crm_products_set_updated_at();
