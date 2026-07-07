-- CRM: 예약 요청 기능 사용 여부 토글
-- true(기본): 회원이 앱/웹에서 예약 요청 가능
-- false: 회원 예약 요청 비활성 (관리자 직접 예약만)

ALTER TABLE crm_center_settings
  ADD COLUMN IF NOT EXISTS booking_enabled BOOLEAN NOT NULL DEFAULT true;
