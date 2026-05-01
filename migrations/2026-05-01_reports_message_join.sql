-- 2026-05-01: 신고 RPC 에 messages 조인 추가 + target_type='job_post' → 'job' 정규화
-- 관리자 신고 탭에서 쪽지/구인글/댓글/종목후기 구분 표시 지원.
-- (이 세션에선 psql 로 이미 적용 완료)

-- 1) target_type 정규화
UPDATE reports SET target_type = 'job' WHERE target_type = 'job_post';

-- 2) RPC 재작성 (DROP + CREATE — 반환 타입 변경)
DROP FUNCTION IF EXISTS public.admin_reports_with_targets();

CREATE FUNCTION public.admin_reports_with_targets()
 RETURNS TABLE(
   id integer, target_type text, target_id integer, post_id integer, category_id integer,
   reason text, custom_reason text, resolved boolean, resolved_at timestamp with time zone,
   deleted_at timestamp with time zone, target_hidden boolean, created_at timestamp with time zone,
   post_title text, post_author text,
   comment_content text, comment_author text,
   category_name text,
   job_title text, job_author text,
   message_content text, message_sender text, message_receiver text
 )
 LANGUAGE sql
 STABLE
AS $function$
  SELECT r.id, r.target_type, r.target_id, r.post_id, r.category_id,
         r.reason, r.custom_reason, r.resolved, r.resolved_at,
         r.deleted_at, r.target_hidden, r.created_at,
         p.title, p.author,
         c.content, c.author,
         cat.name,
         jp.title, jp.center_name,
         m.content, m.sender_nickname, m.receiver_nickname
  FROM reports r
  LEFT JOIN posts p ON r.target_type = 'post' AND r.target_id = p.id
  LEFT JOIN comments c ON r.target_type = 'comment' AND r.target_id = c.id
  LEFT JOIN categories cat ON r.target_type = 'post' AND r.category_id = cat.id
  LEFT JOIN job_posts jp ON r.target_type = 'job' AND r.target_id = jp.id
  LEFT JOIN messages m ON r.target_type = 'message' AND r.target_id = m.id
  ORDER BY r.created_at DESC
$function$;
