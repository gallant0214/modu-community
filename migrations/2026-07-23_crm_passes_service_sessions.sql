-- 서비스 섹션(무료 보너스 세션). 수업료(price_won) 계산에는 포함되지 않는 별도 세션.
-- 회당 수업료 = price_won ÷ total_sessions(기본 결제 섹션)만 사용, service_sessions 제외.
ALTER TABLE crm_passes ADD COLUMN IF NOT EXISTS service_sessions int NOT NULL DEFAULT 0;
