-- CRM: 회원 신체 측정 기록 (인바디)
--
-- 회원별 시계열 측정. 차트로 추세 표시.

CREATE TABLE IF NOT EXISTS crm_body_measurements (
  id                BIGSERIAL PRIMARY KEY,
  center_id         BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  member_id         BIGINT NOT NULL REFERENCES crm_members(id) ON DELETE CASCADE,

  measured_at       DATE NOT NULL,
  height_cm         NUMERIC(5,1),                -- 키 (선택)
  weight_kg         NUMERIC(5,2),                -- 체중
  muscle_kg         NUMERIC(5,2),                -- 골격근량
  body_fat_kg       NUMERIC(5,2),                -- 체지방량
  body_fat_pct      NUMERIC(5,2),                -- 체지방률 %
  bmi               NUMERIC(4,1),                -- 자동 계산 또는 직접 입력
  visceral_fat      INTEGER,                     -- 내장지방 레벨
  basal_metabolism  INTEGER,                     -- 기초대사량 kcal

  memo              TEXT,
  recorded_by_uid   TEXT NOT NULL,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_body_measurements_member
  ON crm_body_measurements (member_id, measured_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_body_measurements_center
  ON crm_body_measurements (center_id, measured_at DESC);

CREATE OR REPLACE FUNCTION crm_body_measurements_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_body_measurements_updated_at ON crm_body_measurements;
CREATE TRIGGER trg_crm_body_measurements_updated_at
  BEFORE UPDATE ON crm_body_measurements
  FOR EACH ROW EXECUTE FUNCTION crm_body_measurements_set_updated_at();
