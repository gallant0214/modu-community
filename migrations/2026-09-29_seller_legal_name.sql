-- 사업자등록증상 상호 (2026-09-29)
-- 카드사 심사는 홈페이지 하단 사업자정보가 등록증과 '완전히 일치'할 것을 요구한다.
-- 화면에 쓰는 센터명은 지점명이 붙어("스페셜바디 범어점") 불일치로 걸린다.
ALTER TABLE crm_centers ADD COLUMN IF NOT EXISTS legal_name text;

-- 판매 페이지 환불 규정의 출처가 될 전자계약서 (2026-09-29)
-- 기본 문구 대신 센터가 실제로 쓰는 계약서의 '환불 약관' 을 그대로 노출한다.
-- 계약서와 홈페이지 문구가 다르면 분쟁이 난다 — 출처를 하나로 묶는다.
ALTER TABLE crm_centers ADD COLUMN IF NOT EXISTS policy_contract_template_id bigint;
