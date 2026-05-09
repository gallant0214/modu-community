-- 2026-05-09: 거래글 status 에 'reserved' (계약중) 추가
-- 기존 active/sold/hidden/deleted 외에 협상·계약 진행 단계 표시.
ALTER TABLE trade_posts
  DROP CONSTRAINT IF EXISTS trade_posts_status_check;

ALTER TABLE trade_posts
  ADD CONSTRAINT trade_posts_status_check
  CHECK (status = ANY (ARRAY['active', 'reserved', 'sold', 'hidden', 'deleted']));

-- 검증
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'trade_posts'::regclass AND conname = 'trade_posts_status_check';
