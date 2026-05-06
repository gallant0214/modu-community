-- 거래(중고기구·센터매매) 게시판 — 한 테이블 + JSON 방식
-- category: 'equipment' | 'center'
-- 공통 필드는 컬럼, 카테고리별 부가 정보는 JSONB(equipment_info / center_info)

CREATE TABLE IF NOT EXISTS trade_posts (
  id              BIGSERIAL PRIMARY KEY,
  firebase_uid    TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (category IN ('equipment','center')),

  -- 공통
  title           TEXT NOT NULL,
  body            TEXT,                       -- 리치에디터 HTML (인수 조건/상세 설명)
  region_sido     TEXT NOT NULL,              -- 시·도
  region_sigungu  TEXT NOT NULL,              -- 시·군·구 (필수)
  contact_phone   TEXT NOT NULL,              -- 연락처 (클릭 시만 노출)
  image_urls      TEXT[] NOT NULL DEFAULT '{}',  -- 1~10장

  -- equipment 전용 컬럼
  product_name    TEXT,                       -- 제품명 (직접 입력)
  condition_text  TEXT,                       -- 상태 등급 (직접 입력, 예: "S급", "A급/사용감 있음")
  price_manwon    INTEGER,                    -- 가격 (만원 단위)
  center_name     TEXT,                       -- 중고는 필수, 센터매매에선 NULL 가능
  equipment_info  JSONB,                      -- { trade_methods: [...] } 등 부가
  -- equipment_info.trade_methods 예시:
  --   [{"type":"direct"},
  --    {"type":"parcel"},
  --    {"type":"delivery","loading":true},
  --    {"type":"etc","text":"부피로 분해 가능"}]

  -- center 전용 (JSONB 한 칸)
  center_info     JSONB,
  -- center_info 예시:
  -- {
  --   "industry": "헬스/피트니스",       -- 업종 (드롭다운, 구인글과 동일)
  --   "store_type": "헬스장",            -- 매장 종류 (직접 입력)
  --   "name_visible": true,              -- 센터명 공개 여부
  --   "name": "OO피트니스",              -- 공개 시에만
  --   "area_pyeong": 110,
  --   "deposit":   {"amount_manwon":13000,"negotiable":"협의가능"},
  --   "monthly":   {"amount_manwon":750, "negotiable":"조정불가"},
  --   "mgmt_fee":  {"amount_manwon":200, "negotiable":"협의가능"},
  --   "premium":   {"amount_manwon":6000,"negotiable":"협의가능"},
  --   "member_count": {"type":"number","value":280}
  --     | {"type":"meet_to_tell"}
  --     | {"type":"etc","text":"..."}
  -- }

  -- 운영
  view_count      INTEGER NOT NULL DEFAULT 0,
  share_count     INTEGER NOT NULL DEFAULT 0,
  bookmark_count  INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','sold','hidden','deleted')),
  agreed_to_terms BOOLEAN NOT NULL DEFAULT false,   -- 등록 전 경고 동의 기록
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 카테고리별 필수 필드 보장
ALTER TABLE trade_posts
  DROP CONSTRAINT IF EXISTS chk_trade_equipment_required;
ALTER TABLE trade_posts
  ADD CONSTRAINT chk_trade_equipment_required
  CHECK (
    category <> 'equipment' OR (
      product_name   IS NOT NULL AND
      condition_text IS NOT NULL AND
      price_manwon   IS NOT NULL AND
      center_name    IS NOT NULL
    )
  );

ALTER TABLE trade_posts
  DROP CONSTRAINT IF EXISTS chk_trade_center_required;
ALTER TABLE trade_posts
  ADD CONSTRAINT chk_trade_center_required
  CHECK (
    category <> 'center' OR (
      center_info IS NOT NULL
    )
  );

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_trade_posts_list
  ON trade_posts (category, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trade_posts_region
  ON trade_posts (region_sido, region_sigungu);

CREATE INDEX IF NOT EXISTS idx_trade_posts_user
  ON trade_posts (firebase_uid);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION trade_posts_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trade_posts_updated_at ON trade_posts;
CREATE TRIGGER trg_trade_posts_updated_at
  BEFORE UPDATE ON trade_posts
  FOR EACH ROW EXECUTE FUNCTION trade_posts_set_updated_at();


-- ─────────────────────────────────────────────
-- 북마크 테이블 (post_bookmarks 패턴 그대로)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trade_post_bookmarks (
  id             BIGSERIAL PRIMARY KEY,
  trade_post_id  BIGINT NOT NULL REFERENCES trade_posts(id) ON DELETE CASCADE,
  firebase_uid   TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trade_post_id, firebase_uid)
);

CREATE INDEX IF NOT EXISTS idx_trade_bookmarks_user
  ON trade_post_bookmarks (firebase_uid, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trade_bookmarks_post
  ON trade_post_bookmarks (trade_post_id);
