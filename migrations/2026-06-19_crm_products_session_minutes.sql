-- CRM 상품: 수업 시간(분) 추가 — 개인 레슨/그룹 수업 용
-- 1회 수업의 길이.

ALTER TABLE crm_products
  ADD COLUMN IF NOT EXISTS session_minutes INTEGER NOT NULL DEFAULT 0
  CHECK (session_minutes >= 0);
