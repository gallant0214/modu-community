-- CRM: 강사 권한에 "타 강사 스케줄 관리" 추가
-- 켜지면 그 강사는 다른 강사의 예약/일정도 만들고 수정·삭제 가능.
-- 기본 false (본인 것만).

ALTER TABLE crm_trainer_permissions
  ADD COLUMN IF NOT EXISTS can_manage_all_schedules BOOLEAN NOT NULL DEFAULT false;
