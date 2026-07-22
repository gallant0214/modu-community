-- 센터 프로필 필드 추가 (센터 정보 탭 신설)
-- 목적: 대표자가 센터 주소·연락처·SNS 링크 등을 관리할 수 있도록.
-- 이미 있는 컬럼(name, phone)은 그대로 두고, 신규 컬럼만 추가.
BEGIN;

ALTER TABLE crm_centers
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS naver_url text,
  ADD COLUMN IF NOT EXISTS google_url text,
  ADD COLUMN IF NOT EXISTS instagram_id text,
  ADD COLUMN IF NOT EXISTS youtube_url text;

COMMENT ON COLUMN crm_centers.address IS '센터 주소 (도로명 + 상세)';
COMMENT ON COLUMN crm_centers.naver_url IS '네이버 플레이스/스마트플레이스 URL';
COMMENT ON COLUMN crm_centers.google_url IS '구글 지도/비즈니스 프로필 URL';
COMMENT ON COLUMN crm_centers.instagram_id IS '인스타그램 아이디 (@ 제외)';
COMMENT ON COLUMN crm_centers.youtube_url IS '유튜브 채널 URL';

COMMIT;
