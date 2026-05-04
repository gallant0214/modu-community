-- 방문자 추적 테이블 — KPI 대시보드용
-- 페이지뷰 기록 + 일별 unique visitor 집계 가능
CREATE TABLE IF NOT EXISTS site_visits (
  id BIGSERIAL PRIMARY KEY,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash TEXT,
  path TEXT
);

CREATE INDEX IF NOT EXISTS site_visits_visited_at_idx
  ON site_visits (visited_at DESC);

-- 일별 unique visitor count 빠르게 집계하기 위한 부분 인덱스 (ip_hash NOT NULL 만)
CREATE INDEX IF NOT EXISTS site_visits_ip_visited_idx
  ON site_visits (ip_hash, visited_at)
  WHERE ip_hash IS NOT NULL;
