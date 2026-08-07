-- CRM 회원 상세 · 운동 기록(간이 메모)
-- 트레이너가 회원의 수업/운동 세션에 대한 간단한 메모를 날짜별로 남기는 용도.
-- crm_member_daily_records 와 별개: 여러 건/날짜 허용, 트레이너 시점의 코칭 노트.

CREATE TABLE IF NOT EXISTS crm_member_workout_logs (
  id           BIGSERIAL PRIMARY KEY,
  center_id    BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  member_id    BIGINT NOT NULL REFERENCES crm_members(id) ON DELETE CASCADE,
  log_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  memo         TEXT NOT NULL,
  created_by_uid TEXT,       -- 작성자 firebase uid
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_member_workout_logs_member
  ON crm_member_workout_logs (center_id, member_id, log_date DESC, id DESC);
