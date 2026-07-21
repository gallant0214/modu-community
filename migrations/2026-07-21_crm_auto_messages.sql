-- 자동 메세지(자동알림) 트리거별 설정. 센터당 트리거 1행.
-- 실제 발송(문자/앱푸시/알림톡)은 이후 채널 연동 시 붙이고, 지금은 설정 저장까지.
CREATE TABLE IF NOT EXISTS crm_auto_message_settings (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  center_id    bigint NOT NULL,
  trigger_key  text   NOT NULL,
  enabled      boolean NOT NULL DEFAULT false,
  name         text,
  send_basis   text   NOT NULL DEFAULT 'immediate',  -- immediate | schedule | count
  send_days    int,                                   -- 일정 기준: N일 (전/후)
  send_count   int,                                   -- 횟수 기준
  methods      jsonb  NOT NULL DEFAULT '[]'::jsonb,    -- ["sms","push","smart","alimtalk"]
  audience     jsonb  NOT NULL DEFAULT '[]'::jsonb,    -- 세그먼트(최대 3)
  message_body text   NOT NULL DEFAULT '',
  coupon_id    bigint,
  config       jsonb  NOT NULL DEFAULT '{}'::jsonb,    -- 확장용
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (center_id, trigger_key)
);

CREATE INDEX IF NOT EXISTS idx_crm_auto_msg_center ON crm_auto_message_settings (center_id);
