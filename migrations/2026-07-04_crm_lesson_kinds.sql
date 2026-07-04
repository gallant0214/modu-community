-- CRM: 수강권 레슨 종류 (센터별 설정)
-- 수강권 발급 시 "수업 종류" 드롭다운에 사용.

CREATE TABLE IF NOT EXISTS crm_lesson_kinds (
  id          BIGSERIAL PRIMARY KEY,
  center_id   BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 100,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (center_id, label)
);

CREATE INDEX IF NOT EXISTS idx_crm_lesson_kinds_center
  ON crm_lesson_kinds (center_id, status, sort_order);
