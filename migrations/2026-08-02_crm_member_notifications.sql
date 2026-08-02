-- 회원 앱 알림 내역 (예약 승인/거절, 센터 메세지·쿠폰 등)
-- 푸시 발송과 별개로 앱 안 '알림함'에서 누적 확인 + 안읽음 뱃지용.
CREATE TABLE IF NOT EXISTS crm_member_notifications (
  id          BIGSERIAL PRIMARY KEY,
  center_id   BIGINT REFERENCES crm_centers(id) ON DELETE CASCADE,
  member_id   BIGINT NOT NULL REFERENCES crm_members(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,           -- reservation_approved / reservation_rejected / message / coupon 등
  title       TEXT NOT NULL,
  body        TEXT,
  data_json   JSONB,                   -- 라우팅용(reservationId 등)
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_member_notifications_member
  ON crm_member_notifications (member_id, created_at DESC);

-- 안읽음 카운트 최적화
CREATE INDEX IF NOT EXISTS idx_crm_member_notifications_unread
  ON crm_member_notifications (member_id)
  WHERE read_at IS NULL;
