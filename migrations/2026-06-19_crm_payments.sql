-- CRM Phase 1.1 — 결제 트랜잭션 + 미수금 인프라
--
-- 기존 crm_passes / crm_memberships 는 1건당 1결제로 단순 가정했음.
-- Phase 1 부터는 분할 결제·미수금·추후 회수를 지원해야 해서,
-- 별도 crm_payments 테이블로 모든 결제 트랜잭션을 누적 기록.
--
-- 정책 (memory: moducm-crm-pos-scope):
--   - POS 단말기 없이 수동 입력만
--   - 결제수단: cash / card / transfer / etc (POS 영수증·세금계산서 미지원)

-- 1) 수강권·회원권에 미수금 + 결제상태 캐시 컬럼 추가
ALTER TABLE crm_passes
  ADD COLUMN IF NOT EXISTS outstanding_won INTEGER NOT NULL DEFAULT 0 CHECK (outstanding_won >= 0),
  ADD COLUMN IF NOT EXISTS payment_status  TEXT NOT NULL DEFAULT 'paid'
    CHECK (payment_status IN ('paid','partial','unpaid'));

ALTER TABLE crm_memberships
  ADD COLUMN IF NOT EXISTS outstanding_won INTEGER NOT NULL DEFAULT 0 CHECK (outstanding_won >= 0),
  ADD COLUMN IF NOT EXISTS payment_status  TEXT NOT NULL DEFAULT 'paid'
    CHECK (payment_status IN ('paid','partial','unpaid'));

-- 미수금 회원 빠른 조회용
CREATE INDEX IF NOT EXISTS idx_crm_passes_outstanding
  ON crm_passes (center_id, payment_status) WHERE outstanding_won > 0;
CREATE INDEX IF NOT EXISTS idx_crm_memberships_outstanding
  ON crm_memberships (center_id, payment_status) WHERE outstanding_won > 0;

-- 2) 결제 트랜잭션 테이블
CREATE TABLE IF NOT EXISTS crm_payments (
  id                BIGSERIAL PRIMARY KEY,
  center_id         BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  member_id         BIGINT NOT NULL REFERENCES crm_members(id) ON DELETE CASCADE,

  -- 어디에 대한 결제인지 (둘 중 정확히 하나)
  pass_id           BIGINT REFERENCES crm_passes(id) ON DELETE CASCADE,
  membership_id     BIGINT REFERENCES crm_memberships(id) ON DELETE CASCADE,

  amount_won        INTEGER NOT NULL CHECK (amount_won > 0),
  method            TEXT NOT NULL DEFAULT 'cash'
                    CHECK (method IN ('cash','card','transfer','etc')),
  method_custom     TEXT,

  paid_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by_uid   TEXT,                                            -- firebase_uid of staff
  note              TEXT,

  status            TEXT NOT NULL DEFAULT 'completed'
                    CHECK (status IN ('completed','cancelled')),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 둘 중 정확히 하나
  CHECK ((pass_id IS NOT NULL)::int + (membership_id IS NOT NULL)::int = 1)
);

CREATE INDEX IF NOT EXISTS idx_crm_payments_member
  ON crm_payments (center_id, member_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_payments_pass
  ON crm_payments (pass_id) WHERE pass_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_payments_membership
  ON crm_payments (membership_id) WHERE membership_id IS NOT NULL;

CREATE OR REPLACE FUNCTION crm_payments_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_payments_updated_at ON crm_payments;
CREATE TRIGGER trg_crm_payments_updated_at
  BEFORE UPDATE ON crm_payments
  FOR EACH ROW EXECUTE FUNCTION crm_payments_set_updated_at();
