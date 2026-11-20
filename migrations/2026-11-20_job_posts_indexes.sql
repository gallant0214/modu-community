-- 구인(job_posts) 조회 인덱스 — 2026-11-20
--
-- 문제: job_posts 에 기본키 말고 인덱스가 없어, /jobs 목록·개수·지역별 개수가 매번
--       6.7만 행(109MB) 전체를 읽었다. 캐시(60초)가 비어 있을 때 조회가 PostgREST
--       statement_timeout(8초)에 걸려 /api/jobs 가 500 → 구인 탭이 빈 목록으로 보였다.
--
-- 🚨 CONCURRENTLY 는 트랜잭션 안에서 못 돈다 — psql 에서 문장 하나씩(자동 커밋) 실행할 것.
--    쓰기를 막지 않으니 고용24 가져오기 중에도 실행해도 된다.

-- 최신순 목록(search_job_posts 기본 정렬), 오늘 올라온 지역(job_posts_today_regions), 기간 조회
CREATE INDEX CONCURRENTLY IF NOT EXISTS job_posts_created_at_idx
  ON public.job_posts (created_at DESC);

-- [모집중만] 최신순 — 함수 안 조건 (NOT is_closed OR is_closed IS NULL) 과 같은 모양이어야 쓰인다
CREATE INDEX CONCURRENTLY IF NOT EXISTS job_posts_open_created_at_idx
  ON public.job_posts (created_at DESC)
  WHERE (is_closed = false OR is_closed IS NULL);

-- 인기순·좋아요순 (ORDER BY views|likes DESC, created_at DESC)
CREATE INDEX CONCURRENTLY IF NOT EXISTS job_posts_views_created_at_idx
  ON public.job_posts (views DESC, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS job_posts_likes_created_at_idx
  ON public.job_posts (likes DESC, created_at DESC);

-- 필터 컬럼 묶음 — count_job_posts(지역·종목·고용형태·모집중 조합)와 지역별 개수 3종이
-- 본문(description) 이 든 큰 테이블 대신 이 작은 인덱스만 읽게(index-only scan) 한다.
CREATE INDEX CONCURRENTLY IF NOT EXISTS job_posts_filter_cols_idx
  ON public.job_posts (region_code, is_closed, sport, employment_type, region_name);

-- index-only scan 은 visibility map 이 채워져 있어야 빠르다
VACUUM (ANALYZE) public.job_posts;
