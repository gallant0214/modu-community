-- CRM 모듈 #4: 예약/스케줄
--
-- PDF 5/5-2 — 시간축×트레이너 그리드 캘린더에 들어가는 예약 단위.
--
-- status:
--   booked     = 예약완료 (PDF 노란색)
--   attended   = 출석완료 (PDF 초록색)
--   cancelled  = 예약취소 (수업시간 전 정상 취소)
--   noshow     = 차감취소/노쇼 (출석 X 인데 세션은 차감)
--
-- consumed = 수강권 잔여 차감 여부.
--   booked → 예약 시점에 잠정 차감 안 함, 출석완료 시 차감 (consumed=true).
--   noshow → consumed=true (차감)
--   cancelled → consumed=false (미차감)
--   미차감 취소 ↔ 차감 취소 구분은 status+consumed 조합으로 판단.

CREATE TABLE IF NOT EXISTS crm_reservations (
  id                  BIGSERIAL PRIMARY KEY,
  center_id           BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  pass_id             BIGINT NOT NULL REFERENCES crm_passes(id) ON DELETE CASCADE,
  member_id           BIGINT NOT NULL REFERENCES crm_members(id) ON DELETE CASCADE,
  trainer_member_id   BIGINT NOT NULL REFERENCES crm_center_members(id),

  starts_at           TIMESTAMPTZ NOT NULL,
  ends_at             TIMESTAMPTZ NOT NULL,

  status              TEXT NOT NULL DEFAULT 'booked'
                      CHECK (status IN ('booked','attended','cancelled','noshow')),
  consumed            BOOLEAN NOT NULL DEFAULT false,

  cancelled_reason    TEXT,
  cancelled_by_uid    TEXT,
  cancelled_at        TIMESTAMPTZ,
  attended_at         TIMESTAMPTZ,

  created_by_uid      TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (ends_at > starts_at)
);

-- 스케줄 그리드 (특정 센터 + 기간 + 트레이너 필터)
CREATE INDEX IF NOT EXISTS idx_crm_reservations_center_range
  ON crm_reservations (center_id, starts_at);

CREATE INDEX IF NOT EXISTS idx_crm_reservations_trainer_range
  ON crm_reservations (trainer_member_id, starts_at);

-- 회원별 수업 내역 (PDF 3-7 수강권 상세 안 "수업내역")
CREATE INDEX IF NOT EXISTS idx_crm_reservations_member
  ON crm_reservations (member_id, starts_at DESC);

-- 수강권 차감/내역 조회
CREATE INDEX IF NOT EXISTS idx_crm_reservations_pass
  ON crm_reservations (pass_id, starts_at DESC);


-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION crm_reservations_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_reservations_updated_at ON crm_reservations;
CREATE TRIGGER trg_crm_reservations_updated_at
  BEFORE UPDATE ON crm_reservations
  FOR EACH ROW EXECUTE FUNCTION crm_reservations_set_updated_at();
