-- CRM 모듈 #5: 정산 규칙 + 센터 설정 + 감사 로그
--
-- PDF 2-4 (정률제/정액제), 7 (예약취소/예약요청/단톡 알림).

-- ─────────────────────────────────────────────
-- 정산 규칙 (PDF 2-4)
-- ─────────────────────────────────────────────
-- target_member_id NULL = 센터 기본 / 값 = 특정 트레이너 override
-- mode='rate' : value 는 백분율 0~100
-- mode='flat' : value 는 원 단위
-- min/max_pass_price_won 으로 구간 (예: 0~900,000원 vs 900,001원~)

CREATE TABLE IF NOT EXISTS crm_payout_rules (
  id                    BIGSERIAL PRIMARY KEY,
  center_id             BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  target_member_id      BIGINT REFERENCES crm_center_members(id) ON DELETE CASCADE,

  mode                  TEXT NOT NULL CHECK (mode IN ('rate','flat')),
  tier_index            INTEGER NOT NULL CHECK (tier_index >= 0),
  min_pass_price_won    INTEGER NOT NULL DEFAULT 0,
  max_pass_price_won    INTEGER,                              -- NULL = 상한 없음

  new_member_value      NUMERIC NOT NULL DEFAULT 0,
  renewal_value         NUMERIC NOT NULL DEFAULT 0,
  trial_value           NUMERIC NOT NULL DEFAULT 0,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (max_pass_price_won IS NULL OR max_pass_price_won >= min_pass_price_won),
  CHECK (
    mode <> 'rate' OR (
      new_member_value BETWEEN 0 AND 100 AND
      renewal_value    BETWEEN 0 AND 100 AND
      trial_value      BETWEEN 0 AND 100
    )
  )
);

-- 룰 조회: center + (target 또는 NULL) + tier 순
CREATE INDEX IF NOT EXISTS idx_crm_payout_rules_lookup
  ON crm_payout_rules (center_id, target_member_id, tier_index);


-- ─────────────────────────────────────────────
-- 센터 설정 (PDF 7)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_center_settings (
  center_id                         BIGINT PRIMARY KEY
                                    REFERENCES crm_centers(id) ON DELETE CASCADE,

  -- 예약 취소
  cancel_hours                      INTEGER NOT NULL DEFAULT 6 CHECK (cancel_hours BETWEEN 0 AND 72),
  member_can_self_cancel_consumed   BOOLEAN NOT NULL DEFAULT true,

  -- 예약 요청
  booking_unit_min                  INTEGER NOT NULL DEFAULT 60
                                    CHECK (booking_unit_min IN (30, 60)),
  booking_horizon_days              INTEGER NOT NULL DEFAULT 30
                                    CHECK (booking_horizon_days BETWEEN 1 AND 365),

  -- 단체채팅 알림
  notify_cancel                     BOOLEAN NOT NULL DEFAULT true,
  notify_change                     BOOLEAN NOT NULL DEFAULT true,
  notify_attend                     BOOLEAN NOT NULL DEFAULT false,
  notify_register                   BOOLEAN NOT NULL DEFAULT false,
  notify_pass_issue                 BOOLEAN NOT NULL DEFAULT false,

  -- 스케줄 그리드 표시
  working_hours_start               TIME NOT NULL DEFAULT TIME '08:00',
  working_hours_end                 TIME NOT NULL DEFAULT TIME '23:00',
  default_columns                   INTEGER NOT NULL DEFAULT 3
                                    CHECK (default_columns BETWEEN 1 AND 10),

  updated_at                        TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ─────────────────────────────────────────────
-- 감사 로그 (수강권 발급/환불, 예약 취소, 권한 변경, 직원 퇴사, 정산규칙 변경)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_audit_logs (
  id            BIGSERIAL PRIMARY KEY,
  center_id     BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  actor_uid     TEXT NOT NULL,
  action        TEXT NOT NULL,                -- 예: pass.issue / pass.refund / reservation.cancel / member.permission.change / staff.deactivate / payout_rule.update
  entity_type   TEXT NOT NULL,                -- pass / reservation / center_member / payout_rule / center_settings
  entity_id     BIGINT,
  payload       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_audit_logs_center
  ON crm_audit_logs (center_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_audit_logs_entity
  ON crm_audit_logs (entity_type, entity_id, created_at DESC);


-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION crm_settings_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_payout_rules_updated_at ON crm_payout_rules;
CREATE TRIGGER trg_crm_payout_rules_updated_at
  BEFORE UPDATE ON crm_payout_rules
  FOR EACH ROW EXECUTE FUNCTION crm_settings_set_updated_at();

DROP TRIGGER IF EXISTS trg_crm_center_settings_updated_at ON crm_center_settings;
CREATE TRIGGER trg_crm_center_settings_updated_at
  BEFORE UPDATE ON crm_center_settings
  FOR EACH ROW EXECUTE FUNCTION crm_settings_set_updated_at();
