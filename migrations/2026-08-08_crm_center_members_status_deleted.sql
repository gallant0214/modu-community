-- 회원 탈퇴(계정 삭제) 시 crm_center_members.status='deleted' 를 허용하도록 CHECK 제약 확장.
-- 기존 제약이 'deleted' 를 막아 /api/crm/account/withdraw 가 500(탈퇴 처리 실패) 나던 문제 수정.
ALTER TABLE crm_center_members DROP CONSTRAINT crm_center_members_status_check;
ALTER TABLE crm_center_members ADD CONSTRAINT crm_center_members_status_check
  CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'pending'::text, 'rejected'::text, 'deleted'::text]));
