-- CRM 회원 앱: 데일리 기록 (수분/식단/몸무게/기분/운동/눈바디 + 메모)
--
-- 회원 본인이 앱에서 남기는 개인 기록. 옵션으로 담당 트레이너에게 공유(share_with_trainer)하면
-- CRM/강사앱에서 조회 가능(공개 피드/좋아요/댓글은 만들지 않음).
--
-- 하루 1행(crm_member_daily_records) + 세부 항목 N행(crm_member_record_items).
-- 사진(식단/눈바디)은 record_items.photo_url 로 확장 예정(2단계). MVP 는 수치/텍스트만.

BEGIN;

-- 하루 단위 요약 행 -------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_member_daily_records (
  id                  BIGSERIAL PRIMARY KEY,
  center_id           BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  member_id           BIGINT NOT NULL REFERENCES crm_members(id) ON DELETE CASCADE,
  record_date         DATE NOT NULL,

  water_ml            INTEGER,                 -- 수분 섭취량(ml)
  weight_kg           NUMERIC(5,2),            -- 몸무게
  mood                TEXT,                    -- 기분 (great/good/soso/tired/bad 등)
  exercise_minutes    INTEGER,                 -- 운동 시간(분)
  exercise_memo       TEXT,                    -- 운동 메모
  meal_summary        TEXT,                    -- 식단 한줄 요약(선택)
  memo                TEXT,                    -- 자유 메모

  share_with_trainer  BOOLEAN NOT NULL DEFAULT true,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 회원 x 날짜 1행
  UNIQUE (center_id, member_id, record_date)
);

CREATE INDEX IF NOT EXISTS idx_crm_member_daily_records_member
  ON crm_member_daily_records (member_id, record_date DESC);

CREATE INDEX IF NOT EXISTS idx_crm_member_daily_records_center_share
  ON crm_member_daily_records (center_id, share_with_trainer, record_date DESC);

-- 세부 항목 (식단/눈바디/운동 등 여러 개) ---------------------------------
CREATE TABLE IF NOT EXISTS crm_member_record_items (
  id            BIGSERIAL PRIMARY KEY,
  record_id     BIGINT NOT NULL REFERENCES crm_member_daily_records(id) ON DELETE CASCADE,
  member_id     BIGINT NOT NULL REFERENCES crm_members(id) ON DELETE CASCADE,   -- 접근검증용 denormalize
  center_id     BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,

  type          TEXT NOT NULL
                CHECK (type IN ('meal','body_photo','exercise','water','mood','weight')),
  label         TEXT,                  -- 예: 아침/점심/저녁/간식/야식/기타, 전면/측면/후면
  value_json    JSONB,                 -- 예: { amount:'적당해요', kind:'다이어트식' }
  photo_url     TEXT,                  -- 2단계: 업로드된 사진 URL
  thumb_url     TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_member_record_items_record
  ON crm_member_record_items (record_id);

CREATE INDEX IF NOT EXISTS idx_crm_member_record_items_member_type
  ON crm_member_record_items (member_id, type, created_at DESC);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION crm_member_daily_records_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_member_daily_records_updated_at ON crm_member_daily_records;
CREATE TRIGGER trg_crm_member_daily_records_updated_at
  BEFORE UPDATE ON crm_member_daily_records
  FOR EACH ROW EXECUTE FUNCTION crm_member_daily_records_set_updated_at();

COMMIT;
