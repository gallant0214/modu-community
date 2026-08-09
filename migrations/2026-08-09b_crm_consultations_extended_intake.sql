-- PT 상담 안전성, 목표 구체화, 지속 요인, 지도 선호 및 후속 관리 정보.
-- 세부 문항은 확장 가능하도록 영역별 JSONB 로 저장합니다.
ALTER TABLE crm_pt_consultations
  ADD COLUMN IF NOT EXISTS safety_screening JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS goal_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pain_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS adherence_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS coaching_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS follow_up_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS selection_other_details JSONB NOT NULL DEFAULT '{}'::jsonb;
