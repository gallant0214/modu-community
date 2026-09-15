-- 카드 가맹점 수수료율(%) — 통계 정산에서 카드 매출 × 수수료율을 지출로 차감
-- 기본 0 = 미설정(가맹점마다 우대수수료율이 달라 추측값을 넣지 않음). 화면에서 미설정 경고.
ALTER TABLE crm_center_settings
  ADD COLUMN IF NOT EXISTS card_fee_percent numeric(4,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN crm_center_settings.card_fee_percent IS '카드 결제 가맹점 수수료율(%). 0=미설정. 통계 정산에서 카드매출×율 을 지출로 차감';
