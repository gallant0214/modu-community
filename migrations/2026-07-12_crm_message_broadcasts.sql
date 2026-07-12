-- CRM 메시지 브로드캐스트 시스템
-- 운영자가 회원 그룹에 메시지 발송 → 회원용 앱(추후) 에서 수신·읽음 처리.
--
-- 설계:
--   crm_message_broadcasts: 발송 이벤트 1건 (제목/본문/대상 필터/발송자)
--   crm_message_recipients: fan-out 수신자 (1 broadcast × N members). 앱은 이 테이블만 조회.

CREATE TABLE IF NOT EXISTS crm_message_broadcasts (
  id              BIGSERIAL PRIMARY KEY,
  center_id       BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,

  title           TEXT NOT NULL,
  body            TEXT NOT NULL,

  -- 발송 대상 유형 (감사·통계용)
  audience_kind   TEXT NOT NULL
                  CHECK (audience_kind IN ('all','active','expiring','expired','unassigned','individual')),
  audience_filter JSONB,  -- individual = { member_ids: [1,2,3] }, expiring = { within_days: 7 } 등

  recipient_count INTEGER NOT NULL DEFAULT 0,

  sent_by_uid     TEXT NOT NULL,       -- 발송자 firebase_uid (crm_center_members)
  sent_by_name    TEXT,                -- 발송 시점 표시명 스냅샷

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_message_broadcasts_center
  ON crm_message_broadcasts (center_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crm_message_recipients (
  id              BIGSERIAL PRIMARY KEY,
  broadcast_id    BIGINT NOT NULL REFERENCES crm_message_broadcasts(id) ON DELETE CASCADE,
  center_id       BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  member_id       BIGINT NOT NULL REFERENCES crm_members(id) ON DELETE CASCADE,

  -- 앱 수신 상태
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','delivered','read','failed')),
  read_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (broadcast_id, member_id)
);

-- 앱 조회: WHERE member_id=? AND status IN ('pending','delivered') ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_crm_message_recipients_member
  ON crm_message_recipients (member_id, status, created_at DESC);

-- 운영자 조회: 특정 broadcast 의 fan-out 목록
CREATE INDEX IF NOT EXISTS idx_crm_message_recipients_broadcast
  ON crm_message_recipients (broadcast_id, status);
