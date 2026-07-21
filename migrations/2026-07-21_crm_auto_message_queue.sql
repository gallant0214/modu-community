-- 자동 메세지 발송 대기열. 회원 매칭 엔진이 조건에 맞는 회원을 찾아 여기에 적재.
-- 실제 발송(회원 앱 푸시 등)은 이후 채널 연동 시 이 큐를 소비한다.
CREATE TABLE IF NOT EXISTS crm_auto_message_queue (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  center_id     bigint NOT NULL,
  trigger_key   text   NOT NULL,
  member_id     bigint NOT NULL,
  message       text   NOT NULL DEFAULT '',
  methods       jsonb  NOT NULL DEFAULT '[]'::jsonb,
  status        text   NOT NULL DEFAULT 'pending',  -- pending | sent | skipped | canceled
  dedupe_key    text   NOT NULL,                     -- trigger:member:기간 → 중복 적재 방지
  scheduled_for date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  sent_at       timestamptz,
  UNIQUE (center_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_crm_auto_q_center_status
  ON crm_auto_message_queue (center_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_auto_q_member
  ON crm_auto_message_queue (member_id);
