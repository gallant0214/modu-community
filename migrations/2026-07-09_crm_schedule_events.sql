-- CRM: 스케줄 이벤트 (수강권과 무관한 센터/개인 일정)
--   type=center   : 센터 전체 공지 이벤트 (모두에게 표시, trainer_member_id NULL 허용)
--   type=personal : 특정 강사의 개인 일정 (trainer_member_id 필수)

CREATE TABLE IF NOT EXISTS crm_schedule_events (
  id                 BIGSERIAL PRIMARY KEY,
  center_id          BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  type               TEXT NOT NULL CHECK (type IN ('center','personal')),
  title              TEXT NOT NULL,
  description        TEXT,
  trainer_member_id  BIGINT REFERENCES crm_center_members(id),
  starts_at          TIMESTAMPTZ NOT NULL,
  ends_at            TIMESTAMPTZ NOT NULL,
  status             TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','cancelled')),
  created_by_uid     TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (ends_at > starts_at),
  CHECK (type = 'center' OR trainer_member_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_crm_schedule_events_range
  ON crm_schedule_events (center_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_crm_schedule_events_trainer
  ON crm_schedule_events (trainer_member_id, starts_at)
  WHERE trainer_member_id IS NOT NULL;
