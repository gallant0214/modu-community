-- 사용자 정의 PT 상담지 템플릿을 위한 스키마.
-- definition: 사용자 지정 섹션·필드 정의(JSON)
-- 기존 크로닝 하드코드 폼(스페셜바디 기본)은 그대로 유지. 커스텀 템플릿은 여기 정의에 따라 렌더.

-- 템플릿에 사용자 정의 섹션/필드 스키마 저장
ALTER TABLE crm_consultation_templates
  ADD COLUMN IF NOT EXISTS definition JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 상담 기록에 커스텀 필드 답변 저장 (definition 의 field key 로 매핑)
ALTER TABLE crm_pt_consultations
  ADD COLUMN IF NOT EXISTS custom_data JSONB NOT NULL DEFAULT '{}'::jsonb;
