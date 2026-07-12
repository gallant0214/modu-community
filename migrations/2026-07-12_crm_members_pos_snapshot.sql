-- crm_members: POS(BROJ) 고객목록 스냅샷 필드. 활성회원 유효/만료 판정 + 회원관리 목록 표시용.
-- 2026-07-12: POS 고객목록 CSV 백필(전화번호 매칭 2,573건).
--  · final_expire_at: 최종 이용 만료일 → 목록 유효/만료 판정에 사용(crm_passes/memberships 미임포트 상태 보완)
--  · current_membership/pass/rental/locker: 보유 상품 스냅샷(문자열). 실제 스케줄 연동은 별도 crm_memberships/passes 임포트 필요
ALTER TABLE crm_members
  ADD COLUMN IF NOT EXISTS registration_type text,   -- 신규/재등록
  ADD COLUMN IF NOT EXISTS first_use_at date,         -- 최초 이용 시작일
  ADD COLUMN IF NOT EXISTS total_paid_won integer NOT NULL DEFAULT 0, -- 누적 결제 금액
  ADD COLUMN IF NOT EXISTS final_expire_at date,      -- 최종 이용 만료일
  ADD COLUMN IF NOT EXISTS last_purchase_at date,     -- 마지막 구매일
  ADD COLUMN IF NOT EXISTS last_attended_at date,     -- 마지막 출석일(POS 스냅샷)
  ADD COLUMN IF NOT EXISTS attendance_no text,        -- 출석 번호
  ADD COLUMN IF NOT EXISTS current_membership text,   -- 보유 멤버십
  ADD COLUMN IF NOT EXISTS current_pass text,         -- 보유 이용권
  ADD COLUMN IF NOT EXISTS current_rental text,       -- 보유 대여권
  ADD COLUMN IF NOT EXISTS current_locker text;       -- 보유 락커
-- 백필 데이터: scratchpad 05_member_fields.sql (전화번호 digits 매칭 UPDATE 2,573건).
