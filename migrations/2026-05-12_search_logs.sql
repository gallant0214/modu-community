-- 2026-05-12: 검색어 로그 — 사용자가 무엇을 찾고 있는지 분석
-- scope: community(종목후기) / jobs(구인) / trade(거래) — 통합 단일 테이블
-- result_count: 검색 결과 0건이면 '못 채우는 수요' 분석에 사용
CREATE TABLE IF NOT EXISTS search_logs (
  id BIGSERIAL PRIMARY KEY,
  query TEXT NOT NULL,
  scope TEXT NOT NULL,
  search_type TEXT,             -- 'title' / 'content' / 'author' / 'region' 등 (있을 때만)
  result_count INTEGER,
  firebase_uid TEXT,            -- 로그인 시 (선택)
  platform TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_search_scope CHECK (scope IN ('community','jobs','trade')),
  CONSTRAINT chk_search_platform CHECK (platform IN ('web','ios','android'))
);

CREATE INDEX IF NOT EXISTS search_logs_created_at_idx
  ON search_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS search_logs_scope_idx
  ON search_logs (scope, created_at DESC);

CREATE INDEX IF NOT EXISTS search_logs_query_idx
  ON search_logs (query, created_at DESC);

CREATE INDEX IF NOT EXISTS search_logs_zero_result_idx
  ON search_logs (created_at DESC) WHERE result_count = 0;

-- 검증
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'search_logs';
