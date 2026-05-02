-- 2026 실기·구술 공지 시스템
-- Generated: 2026-05-02
-- 목적: 실기/구술 탭 공지 카드 메뉴 + 71종목 단체 검색

CREATE TABLE IF NOT EXISTS practical_oral_notices (
  id            SERIAL PRIMARY KEY,
  audience      TEXT NOT NULL DEFAULT 'main' CHECK (audience IN ('main', 'disabled')),
  slug          TEXT NOT NULL,
  icon          TEXT,
  badge         TEXT,
  title         TEXT NOT NULL,
  summary       TEXT,
  content       TEXT NOT NULL DEFAULT '',
  display_order INT DEFAULT 0,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (audience, slug)
);

CREATE INDEX IF NOT EXISTS idx_practical_oral_notices_audience_active
  ON practical_oral_notices (audience, is_active, display_order);

CREATE TABLE IF NOT EXISTS sport_organizations (
  id            SERIAL PRIMARY KEY,
  audience      TEXT NOT NULL DEFAULT 'main' CHECK (audience IN ('main', 'disabled')),
  sport_name    TEXT NOT NULL,
  org_name      TEXT NOT NULL,
  phone         TEXT,
  zipcode       TEXT,
  address       TEXT,
  website       TEXT,
  display_order INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sport_organizations_audience
  ON sport_organizations (audience, display_order);

CREATE INDEX IF NOT EXISTS idx_sport_organizations_sport_name
  ON sport_organizations (sport_name);

-- 공지 자동 updated_at 갱신 트리거
CREATE OR REPLACE FUNCTION trg_practical_oral_notices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS practical_oral_notices_updated_at ON practical_oral_notices;
CREATE TRIGGER practical_oral_notices_updated_at
  BEFORE UPDATE ON practical_oral_notices
  FOR EACH ROW EXECUTE FUNCTION trg_practical_oral_notices_updated_at();

DROP TRIGGER IF EXISTS sport_organizations_updated_at ON sport_organizations;
CREATE TRIGGER sport_organizations_updated_at
  BEFORE UPDATE ON sport_organizations
  FOR EACH ROW EXECUTE FUNCTION trg_practical_oral_notices_updated_at();
