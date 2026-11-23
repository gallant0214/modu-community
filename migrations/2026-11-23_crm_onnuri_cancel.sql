-- 온누리 가맹점 앱 '결제 취소' 알림 → 직원 확인 후 CRM 환불
-- cancel_state: open(확인 필요) / refunded(환불 처리) / dismissed(관계없음 — 카운터 직접 결제 등)
ALTER TABLE crm_onnuri_notifications
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'payment',
  ADD COLUMN IF NOT EXISTS cancel_amount_won integer,
  ADD COLUMN IF NOT EXISTS cancel_state text,
  ADD COLUMN IF NOT EXISTS cancel_order_id bigint REFERENCES crm_orders(id),
  ADD COLUMN IF NOT EXISTS cancel_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_resolved_by text;

ALTER TABLE crm_onnuri_notifications DROP CONSTRAINT IF EXISTS crm_onnuri_notifications_kind_check;
ALTER TABLE crm_onnuri_notifications ADD CONSTRAINT crm_onnuri_notifications_kind_check
  CHECK (kind IN ('payment', 'cancel', 'other'));
ALTER TABLE crm_onnuri_notifications DROP CONSTRAINT IF EXISTS crm_onnuri_notifications_cancel_state_check;
ALTER TABLE crm_onnuri_notifications ADD CONSTRAINT crm_onnuri_notifications_cancel_state_check
  CHECK (cancel_state IS NULL OR cancel_state IN ('open', 'refunded', 'dismissed'));

CREATE INDEX IF NOT EXISTS idx_onnuri_noti_cancel_open
  ON crm_onnuri_notifications (center_id) WHERE cancel_state = 'open';
