-- CRM: 예약 취소 기능 사용 여부 (회원 셀프 취소 On/Off)
-- true(기본): 회원이 예약을 취소할 수 있음 (cancel_hours 시간 규정 적용)
-- false: 회원이 취소 불가, 관리자만 취소 가능

ALTER TABLE crm_center_settings
  ADD COLUMN IF NOT EXISTS cancel_enabled BOOLEAN NOT NULL DEFAULT true;
