-- 모바일 온누리상품권 현장 결제 자동 확인 (2026-11-23)
--
-- 흐름: 회원이 앱·홈페이지 결제 화면에서 '모바일 온누리' 선택 → 카운터 가맹점 QR 로 결제
--      → 카운터 공기계의 온누리 가맹점 앱 알림을 '온누리 알림 앱'이 서버로 전달
--      → 금액·시각이 맞는 주문을 찾아 자동 발급.
--      못 맞추면 회원은 임시 입장, 10분 뒤 권한 직원에게 '미수 · 온누리 결제 확인 요망'.
--
-- 🚨 기존 데이터는 건드리지 않는다 — 컬럼·테이블 추가만.

-- ── 주문: 온누리 결제 진행 상태 ─────────────────────────────
-- onnuri_state
--   NULL      : 일반(PG) 주문
--   waiting   : 결제수단으로 온누리를 고름 (아직 '결제했어요' 전)
--   claimed   : 회원이 '결제했어요' 를 누름 — 확인 전까지 임시 입장 가능
--   matched   : 공기계 알림과 자동으로 맞춰져 발급 완료
--   approved  : 직원이 수동 승인해 발급 완료
--   rejected  : 직원이 거절(결제 안 됨) — 임시 입장도 끝
ALTER TABLE crm_orders ADD COLUMN IF NOT EXISTS onnuri_state text;
ALTER TABLE crm_orders ADD COLUMN IF NOT EXISTS onnuri_started_at timestamptz;
ALTER TABLE crm_orders ADD COLUMN IF NOT EXISTS onnuri_claimed_at timestamptz;
-- 10분 안에 못 맞춰 직원에게 확인 요청 알림을 보낸 시각 (중복 발송 방지)
ALTER TABLE crm_orders ADD COLUMN IF NOT EXISTS onnuri_alerted_at timestamptz;
-- 자동으로 맞춰진 공기계 알림
ALTER TABLE crm_orders ADD COLUMN IF NOT EXISTS onnuri_notification_id bigint;
ALTER TABLE crm_orders ADD COLUMN IF NOT EXISTS onnuri_resolved_at timestamptz;
-- 처리한 직원 uid, 자동이면 'auto'
ALTER TABLE crm_orders ADD COLUMN IF NOT EXISTS onnuri_resolved_by text;
ALTER TABLE crm_orders ADD COLUMN IF NOT EXISTS onnuri_reject_reason text;
ALTER TABLE crm_orders DROP CONSTRAINT IF EXISTS crm_orders_onnuri_state_check;
ALTER TABLE crm_orders ADD CONSTRAINT crm_orders_onnuri_state_check CHECK (
  onnuri_state IS NULL OR onnuri_state IN ('waiting', 'claimed', 'matched', 'approved', 'rejected')
);
CREATE INDEX IF NOT EXISTS crm_orders_onnuri_open_idx
  ON crm_orders (center_id, onnuri_state)
  WHERE onnuri_state IN ('waiting', 'claimed');

-- ── 카운터 공기계(온누리 알림 앱) ───────────────────────────
-- pair_code: CRM 설정에서 만든 6자리 연결 코드 (10분 유효). 앱에 입력하면 기기 토큰을 받는다.
-- token_hash: 기기 토큰 원문의 SHA-256(hex). 원문은 저장하지 않는다.
-- source_package: 알림을 읽을 앱(온누리 가맹점 앱)의 안드로이드 패키지 — 앱에서 고른 값
CREATE TABLE IF NOT EXISTS crm_onnuri_devices (
  id bigserial PRIMARY KEY,
  center_id bigint NOT NULL REFERENCES crm_centers(id),
  name text NOT NULL,
  pair_code text,
  pair_code_expires_at timestamptz,
  token_hash text UNIQUE,
  source_package text,
  created_by_uid text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  paired_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS crm_onnuri_devices_center_idx ON crm_onnuri_devices(center_id);
ALTER TABLE crm_onnuri_devices ENABLE ROW LEVEL SECURITY;

-- ── 공기계가 보낸 온누리 결제 알림 ─────────────────────────
-- amount_won: 알림 본문에서 읽은 금액 (못 읽으면 NULL — 직원이 수동 연결)
-- dedupe_key: 같은 알림이 두 번 와도 한 번만 저장 (앱이 재전송해도 안전)
-- matched_order_id: 이 알림으로 발급된 주문
CREATE TABLE IF NOT EXISTS crm_onnuri_notifications (
  id bigserial PRIMARY KEY,
  center_id bigint NOT NULL REFERENCES crm_centers(id),
  device_id bigint REFERENCES crm_onnuri_devices(id),
  package text,
  title text,
  body text,
  amount_won integer,
  posted_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  dedupe_key text NOT NULL,
  matched_order_id bigint,
  match_note text,
  CONSTRAINT crm_onnuri_notifications_dedupe UNIQUE (device_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS crm_onnuri_notifications_center_idx
  ON crm_onnuri_notifications(center_id, posted_at DESC);
ALTER TABLE crm_onnuri_notifications ENABLE ROW LEVEL SECURITY;
