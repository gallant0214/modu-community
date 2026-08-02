-- 회원 앱 셀프 회원가입: 개인정보 수집·이용 동의 시각 기록
-- (PIPA §15 — 동의를 받았다는 증빙용. 항목/목적/보유기간은 앱 동의 화면에 고지)
ALTER TABLE crm_members
  ADD COLUMN IF NOT EXISTS privacy_agreed_at TIMESTAMPTZ;
