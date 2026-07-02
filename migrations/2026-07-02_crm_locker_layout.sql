-- CRM: 락커 배치도(수동 배치) 지원
--
-- 사용자가 락커룸의 물리적 배치를 그대로 그림처럼 편집.
-- 기본은 자동 정렬(번호순)이고, layout_row/col 이 채워져 있으면 그 위치를 사용.

ALTER TABLE crm_locker_zones
  ADD COLUMN IF NOT EXISTS layout_rows INTEGER NOT NULL DEFAULT 0 CHECK (layout_rows >= 0),
  ADD COLUMN IF NOT EXISTS layout_cols INTEGER NOT NULL DEFAULT 0 CHECK (layout_cols >= 0);

ALTER TABLE crm_lockers
  ADD COLUMN IF NOT EXISTS layout_row INTEGER,
  ADD COLUMN IF NOT EXISTS layout_col INTEGER;

CREATE INDEX IF NOT EXISTS idx_crm_lockers_layout
  ON crm_lockers (zone_id, layout_row, layout_col)
  WHERE layout_row IS NOT NULL AND layout_col IS NOT NULL;
