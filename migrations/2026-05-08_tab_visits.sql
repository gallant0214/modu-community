-- 탭 방문 추적 — 어느 탭(실기·구술/종목후기/구인/거래)에 얼마나 머무는지 익명 집계
-- entered_at: 진입 시각, left_at/duration_ms: 이탈 시 기록 (sendBeacon 또는 cleanup)
CREATE TABLE IF NOT EXISTS tab_visits (
  id BIGSERIAL PRIMARY KEY,
  tab_key TEXT NOT NULL,
  platform TEXT NOT NULL,
  session_id TEXT NOT NULL,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  duration_ms INTEGER,
  CONSTRAINT chk_tab_key CHECK (tab_key IN ('practical', 'community', 'jobs', 'trade')),
  CONSTRAINT chk_platform CHECK (platform IN ('web', 'ios', 'android'))
);

CREATE INDEX IF NOT EXISTS tab_visits_entered_at_idx
  ON tab_visits (entered_at DESC);

CREATE INDEX IF NOT EXISTS tab_visits_tab_entered_idx
  ON tab_visits (tab_key, entered_at DESC);

CREATE INDEX IF NOT EXISTS tab_visits_open_idx
  ON tab_visits (entered_at)
  WHERE left_at IS NULL;
