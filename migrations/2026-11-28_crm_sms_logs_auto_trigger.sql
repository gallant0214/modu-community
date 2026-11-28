-- 메세지 전송 로그: 자동 메세지 문자가 '어떤 자동 메세지'인지 남긴다 (2026-11-28)
-- 앱푸시 기록(crm_message_broadcasts)은 audience_filter.trigger_key 에 이미 남기고 있다.
alter table crm_sms_logs add column if not exists auto_trigger_key text;
create index if not exists crm_sms_logs_center_trigger_idx
  on crm_sms_logs (center_id, auto_trigger_key, created_at desc);
