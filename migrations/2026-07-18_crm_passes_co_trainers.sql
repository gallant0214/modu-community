-- 수강권(레슨권) 추가 담당 강사. trainer_member_id(주 강사)는 정산·통계 귀속용으로 유지,
-- co_trainer_ids 는 공동 진행 강사 목록(표시/배정용).
ALTER TABLE crm_passes ADD COLUMN IF NOT EXISTS co_trainer_ids bigint[] NOT NULL DEFAULT '{}';
