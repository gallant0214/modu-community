-- 상권 동향(경쟁업체) 분석
-- 출처: 행정안전부 지방행정 인허가 데이터(LOCALDATA) 체육시설업
--  · 인허가일자/폐업일자가 있어 '언제 몇 개가 새로 생겼나'를 소급 분석할 수 있다.
--  · 좌표는 LOCALDATA 원본이 EPSG:5174(중부원점)라 그대로 못 쓴다 → 주소를 카카오 로컬 API 로 지오코딩해 WGS84 로 저장.

-- 1) 센터 좌표 — 반경 계산의 기준점. 주소 지오코딩 결과를 캐시한다.
ALTER TABLE crm_centers
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS geocoded_at timestamptz;

-- 2) 인허가 업소 캐시 — 전 센터 공용(같은 시군구면 재수집 불필요)
CREATE TABLE IF NOT EXISTS crm_market_facilities (
  mgt_no        text PRIMARY KEY,                     -- LOCALDATA 관리번호(고유)
  biz_type      text NOT NULL,                        -- 내부 업종코드 (gym, pilates, ...)
  svc_name      text,                                 -- 개방서비스명 원문
  upte_name     text,                                 -- 업태구분명 원문
  biz_name      text,                                 -- 사업장명
  road_addr     text,
  lot_addr      text,
  sido          text,
  sigungu       text,
  lat           double precision,
  lng           double precision,
  geocode_state text NOT NULL DEFAULT 'pending',      -- pending | ok | failed
  opened_on     date,                                 -- 인허가일자
  closed_on     date,                                 -- 폐업일자
  state_name    text,                                 -- 영업상태명(영업/정상, 폐업 등)
  is_open       boolean NOT NULL DEFAULT true,
  raw           jsonb,
  synced_at     timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_fac_region  ON crm_market_facilities (sido, sigungu, biz_type);
CREATE INDEX IF NOT EXISTS idx_market_fac_opened  ON crm_market_facilities (opened_on);
CREATE INDEX IF NOT EXISTS idx_market_fac_coords  ON crm_market_facilities (lat, lng) WHERE lat IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_market_fac_geocode ON crm_market_facilities (geocode_state) WHERE geocode_state = 'pending';

-- 3) 업종별 동기화 상태 — 증분 수집(마지막으로 받아온 인허가일자)용
CREATE TABLE IF NOT EXISTS crm_market_sync_state (
  biz_type       text PRIMARY KEY,
  last_synced_at timestamptz,
  synced_through date,                                -- 이 날짜까지의 인허가분을 받아옴
  last_result    jsonb
);
