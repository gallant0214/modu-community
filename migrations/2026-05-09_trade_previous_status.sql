-- 2026-05-09: 거래글 숨김 처리 시 이전 status 보관
-- 숨김 해제 시 마지막 등록된 게시글 상태(active/reserved/sold)로 복귀.
ALTER TABLE trade_posts
  ADD COLUMN IF NOT EXISTS previous_status TEXT;

-- 검증
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'trade_posts' AND column_name = 'previous_status';
