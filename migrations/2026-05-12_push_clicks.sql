-- 2026-05-12: 푸시 알림 클릭률(CTR) 측정용 로그
-- 발송 = admin_broadcasts.sent_count
-- 클릭 = push_clicks.count (사용자가 알림 탭 시 클라 → 서버)
CREATE TABLE IF NOT EXISTS push_clicks (
  id BIGSERIAL PRIMARY KEY,
  firebase_uid TEXT,
  broadcast_id INTEGER,
  type TEXT NOT NULL,           -- 'admin_broadcast', 'notice', 'ad', 'promo', 'comment', 'reply', 'like', 'message', 'keyword', 'trade_price_drop', 등
  platform TEXT NOT NULL,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_push_click_platform CHECK (platform IN ('web','ios','android'))
);

CREATE INDEX IF NOT EXISTS push_clicks_clicked_at_idx
  ON push_clicks (clicked_at DESC);

CREATE INDEX IF NOT EXISTS push_clicks_broadcast_idx
  ON push_clicks (broadcast_id) WHERE broadcast_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS push_clicks_type_idx
  ON push_clicks (type, clicked_at DESC);

-- 검증
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'push_clicks';
