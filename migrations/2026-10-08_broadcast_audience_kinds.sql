-- 메세지 전송 로그 누락 수정
--  1) audience_kind 에 'dormant'(장기 미출석)·'auto'(자동 메세지) 추가
--     - dormant 는 화면에서 고를 수 있는데 CHECK 에 없어 공지 발송 기록이 실패하고 있었다
--     - auto 는 자동 메세지 앱 푸시 발송 이력을 남기기 위해 새로 쓴다
--  2) sent_by_uid NOT NULL 유지 → 자동 발송은 'auto' 문자열을 넣는다(사람이 아님)
ALTER TABLE crm_message_broadcasts
  DROP CONSTRAINT IF EXISTS crm_message_broadcasts_audience_kind_check;

ALTER TABLE crm_message_broadcasts
  ADD CONSTRAINT crm_message_broadcasts_audience_kind_check
  CHECK (audience_kind = ANY (ARRAY[
    'all'::text, 'active'::text, 'expiring'::text, 'expired'::text,
    'unassigned'::text, 'individual'::text, 'dormant'::text, 'auto'::text
  ]));
