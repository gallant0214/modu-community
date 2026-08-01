-- 담당 강사 '직접 입력' 옵션. 명단에 없는 강사/외부 인원이 상담한 경우 사용.
-- trainer_member_id 는 그대로 null, trainer_name_custom 에 자유 텍스트 저장.

ALTER TABLE crm_pt_consultations
  ADD COLUMN IF NOT EXISTS trainer_name_custom TEXT;
