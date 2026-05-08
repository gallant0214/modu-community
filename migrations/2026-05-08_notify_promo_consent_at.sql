-- 2026-05-08: 광고/프로모션 알림 동의 시점 기록 컬럼
-- 정보통신망법 제50조 + 시행령 62조의2 ②항: 광고성 정보 발송 시 동의 시점 증빙 보관 의무
-- 추후 시행령 62조의3에 따른 2년 재동의 처리에도 사용.
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS notify_promo_agreed_at TIMESTAMPTZ;

-- 검증
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'notification_preferences'
  AND column_name = 'notify_promo_agreed_at';
