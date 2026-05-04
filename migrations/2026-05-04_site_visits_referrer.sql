-- site_visits 에 referrer 컬럼 추가 — 유입 채널/키워드 분석용
ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS referrer TEXT;

CREATE INDEX IF NOT EXISTS site_visits_referrer_idx
  ON site_visits (referrer)
  WHERE referrer IS NOT NULL;
