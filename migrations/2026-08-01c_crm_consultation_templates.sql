-- PT 상담지 템플릿. 센터별로 여러 상담지 스타일을 관리.
-- 폼 구조는 현재 하나(스페셜바디 원본) 지만 이름·설명만 다르게 관리하고,
-- 각 상담 기록에 어느 템플릿으로 상담했는지 남겨 나중에 분석 가능.

CREATE TABLE IF NOT EXISTS crm_consultation_templates (
  id           BIGSERIAL PRIMARY KEY,
  center_id    BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  is_default   BOOLEAN NOT NULL DEFAULT false,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_consultation_templates_center
  ON crm_consultation_templates (center_id, active, sort_order, id);

-- 각 상담 기록에 사용한 템플릿 참조
ALTER TABLE crm_pt_consultations
  ADD COLUMN IF NOT EXISTS template_id BIGINT
    REFERENCES crm_consultation_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_pt_consultations_template
  ON crm_pt_consultations (template_id) WHERE template_id IS NOT NULL;
