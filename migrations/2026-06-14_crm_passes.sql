-- CRM 모듈 #3: 수강권
--
-- PDF 4/3-6/3-7 — 수강권 발급(개인PT 10회 등), 결제정보(현금/카드/계좌/미기재/기타),
-- 잔여 횟수, 만료일, 상태(유효/만료/환불/삭제) 관리.
--
-- issue_type:  new = 신규, renewal = 재등록, trial = 체험, service = 서비스
-- payment_method: cash(현금) / card(카드) / transfer(계좌) / custom(직접입력) / etc(기타)
--   custom 선택 시 payment_method_custom 컬럼에 사용자가 입력한 텍스트 저장

CREATE TABLE IF NOT EXISTS crm_passes (
  id                    BIGSERIAL PRIMARY KEY,
  center_id             BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  member_id             BIGINT NOT NULL REFERENCES crm_members(id) ON DELETE CASCADE,

  trainer_member_id     BIGINT NOT NULL REFERENCES crm_center_members(id),  -- 담당 트레이너
  seller_member_id      BIGINT NOT NULL REFERENCES crm_center_members(id),  -- 판매 직원

  issue_type            TEXT NOT NULL
                        CHECK (issue_type IN ('new','renewal','trial','service')),
  lesson_kind           TEXT NOT NULL,                                       -- "개인PT(10회)" 같은 표기 라벨
  total_sessions        INTEGER NOT NULL CHECK (total_sessions >= 0),
  remaining_sessions    INTEGER NOT NULL CHECK (remaining_sessions >= 0),
  session_minutes       INTEGER NOT NULL CHECK (session_minutes > 0),

  price_won             INTEGER NOT NULL DEFAULT 0 CHECK (price_won >= 0),
  vat_included          BOOLEAN NOT NULL DEFAULT false,
  payment_method        TEXT NOT NULL DEFAULT 'custom'
                        CHECK (payment_method IN ('cash','card','transfer','custom','etc')),
  payment_method_custom TEXT,                                                 -- payment_method='custom' 일 때 사용자 입력값

  issued_at             DATE NOT NULL,
  expires_at            DATE NOT NULL,
  status                TEXT NOT NULL DEFAULT 'valid'
                        CHECK (status IN ('valid','expired','refunded','deleted')),
  memo                  TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (remaining_sessions <= total_sessions),
  CHECK (expires_at >= issued_at)
);

-- 목록/필터 인덱스
CREATE INDEX IF NOT EXISTS idx_crm_passes_center_list
  ON crm_passes (center_id, status, issued_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_passes_member
  ON crm_passes (member_id, status, issued_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_passes_trainer
  ON crm_passes (trainer_member_id, status);

CREATE INDEX IF NOT EXISTS idx_crm_passes_seller
  ON crm_passes (seller_member_id, status);

-- 만료 임박 / 통계용
CREATE INDEX IF NOT EXISTS idx_crm_passes_expires
  ON crm_passes (center_id, status, expires_at);


-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION crm_passes_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_passes_updated_at ON crm_passes;
CREATE TRIGGER trg_crm_passes_updated_at
  BEFORE UPDATE ON crm_passes
  FOR EACH ROW EXECUTE FUNCTION crm_passes_set_updated_at();
