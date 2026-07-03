-- CRM: 계약서 양식에 sections JSONB 추가
-- 기존 body TEXT 는 유지 (레거시 호환).
-- sections 는 [{ key, title, body, required }] 형태.

ALTER TABLE crm_contract_templates
  ADD COLUMN IF NOT EXISTS sections JSONB NOT NULL DEFAULT '[]'::jsonb;
