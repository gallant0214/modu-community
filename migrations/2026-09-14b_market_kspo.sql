-- 상권 동향 데이터 출처 전환: 인허가(LOCALDATA) → 국민체육진흥공단 전국체육시설 정보
--  · 좌표(WGS84)가 응답에 내장돼 있어 지오코딩이 불필요하다.
--  · 단 **개업일 필드가 없다**(base_ymd 는 데이터 기준일이지 개설일이 아님).
--    따라서 '신규'는 우리가 처음 관측한 시점(first_seen_at)으로 판정한다.

ALTER TABLE crm_market_facilities
  ADD COLUMN IF NOT EXISTS ftype_name    text,                      -- 시설유형 (체력단련장, 태권도 …)
  ADD COLUMN IF NOT EXISTS faci_gb       text,                      -- 구분 (신고 / 등록)
  ADD COLUMN IF NOT EXISTS base_on       date,                      -- 기준일자(base_ymd) — 개업일 아님
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz NOT NULL DEFAULT now(), -- 우리가 처음 관측한 시점
  ADD COLUMN IF NOT EXISTS source        text NOT NULL DEFAULT 'kspo';

CREATE INDEX IF NOT EXISTS idx_market_fac_first_seen ON crm_market_facilities (first_seen_at);
CREATE INDEX IF NOT EXISTS idx_market_fac_closed     ON crm_market_facilities (closed_on);

-- 전국 스캔을 여러 번에 나눠 이어받기 위한 페이지 커서
ALTER TABLE crm_market_sync_state
  ADD COLUMN IF NOT EXISTS last_page   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_count integer;
