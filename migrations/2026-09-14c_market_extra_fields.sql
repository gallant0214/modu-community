-- 상권분석용 추가 필드
--  emd = 읍면동 (동별 밀집도)
--  gfa = 연면적 m² (경쟁 시설 규모 비교 — 자영업자 관점에서 중요)
ALTER TABLE crm_market_facilities
  ADD COLUMN IF NOT EXISTS emd text,
  ADD COLUMN IF NOT EXISTS gfa numeric;

CREATE INDEX IF NOT EXISTS idx_market_fac_emd ON crm_market_facilities (sigungu, emd);
