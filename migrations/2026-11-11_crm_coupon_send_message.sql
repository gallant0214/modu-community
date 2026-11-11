-- 쿠폰 발송 안내 문구 (변수 포함 원본)
-- message_template: 발송 건마다 보낸 문구 원본 — 저장한 문구가 없을 때 '마지막으로 보낸 문구'로 채운다 (2026-11-10)
-- coupon_send_message: 화면의 '현재 문구 저장'으로 고정한 문구. 있으면 발송 화면을 열 때 항상 이 문구를 채운다
--   (발송해도 바뀌지 않음 — 다시 저장해야 바뀐다). NULL = 저장 안 함
ALTER TABLE crm_coupon_sends ADD COLUMN IF NOT EXISTS message_template text;
ALTER TABLE crm_center_settings ADD COLUMN IF NOT EXISTS coupon_send_message text;
COMMENT ON COLUMN crm_center_settings.coupon_send_message IS
  '쿠폰 발송 안내 문구 저장값(변수 포함). 있으면 발송 화면에 우선 채움. NULL=저장 안 함';
