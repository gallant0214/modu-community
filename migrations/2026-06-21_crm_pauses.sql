-- CRM: 회원 홀딩(정지) 기록
--
-- 회원이 휴가/부상/사정으로 수강권·회원권을 잠시 멈추는 기간.
-- 홀딩 시작 시 expires_at 을 (end - start) 만큼 즉시 연장하고,
-- 취소되면 연장도 되돌린다.

CREATE TABLE IF NOT EXISTS crm_pauses (
  id              BIGSERIAL PRIMARY KEY,
  center_id       BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  member_id       BIGINT NOT NULL REFERENCES crm_members(id) ON DELETE CASCADE,

  -- 둘 중 정확히 하나
  pass_id         BIGINT REFERENCES crm_passes(id) ON DELETE CASCADE,
  membership_id   BIGINT REFERENCES crm_memberships(id) ON DELETE CASCADE,

  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  reason          TEXT,
  requested_by    TEXT,                                              -- 홀딩 요청한 사람(이름)

  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','cancelled')),

  -- 적용한 연장 일수 (취소 시 되돌리기 용)
  extended_days   INTEGER NOT NULL DEFAULT 0 CHECK (extended_days >= 0),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_uid  TEXT,
  cancelled_at    TIMESTAMPTZ,
  cancelled_by_uid TEXT,

  CHECK (end_date >= start_date),
  CHECK ((pass_id IS NOT NULL)::int + (membership_id IS NOT NULL)::int = 1)
);

CREATE INDEX IF NOT EXISTS idx_crm_pauses_member
  ON crm_pauses (center_id, member_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_crm_pauses_pass
  ON crm_pauses (pass_id) WHERE pass_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_pauses_membership
  ON crm_pauses (membership_id) WHERE membership_id IS NOT NULL;

-- 수강권·회원권에 "현재 홀딩 중인가" 캐시 컬럼
ALTER TABLE crm_passes
  ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE crm_memberships
  ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT false;
