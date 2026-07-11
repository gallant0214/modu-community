-- 강사(직원) 서명을 계약서에 추가.
-- 회원 서명(signature_data_url) 과 별개로 강사 서명 PNG base64 + 강사 정보 저장.
--   trainer_signature_data_url: PNG base64 (canvas toDataURL). NULL 허용 (구계약)
--   trainer_info:               { center_member_id: number, name: string } JSONB
ALTER TABLE crm_signed_contracts
  ADD COLUMN IF NOT EXISTS trainer_signature_data_url TEXT,
  ADD COLUMN IF NOT EXISTS trainer_info JSONB;
