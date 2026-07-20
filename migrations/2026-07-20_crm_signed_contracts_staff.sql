-- 근로(직원) 전자계약서: 직원(crm_center_members) 대상 서명계약 지원
ALTER TABLE crm_signed_contracts ADD COLUMN IF NOT EXISTS staff_member_id bigint;
CREATE INDEX IF NOT EXISTS idx_crm_signed_contracts_staff ON crm_signed_contracts(center_id, staff_member_id);
