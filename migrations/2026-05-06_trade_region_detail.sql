-- 거래 글: region_detail (상세 주소) 컬럼 추가
-- equipment(중고거래)에서는 필수, center(센터매매)에서는 선택

ALTER TABLE trade_posts
  ADD COLUMN IF NOT EXISTS region_detail TEXT;

-- equipment 필수 필드에 region_detail 포함하도록 CHECK 재정의
ALTER TABLE trade_posts
  DROP CONSTRAINT IF EXISTS chk_trade_equipment_required;
ALTER TABLE trade_posts
  ADD CONSTRAINT chk_trade_equipment_required
  CHECK (
    category <> 'equipment' OR (
      product_name   IS NOT NULL AND
      condition_text IS NOT NULL AND
      price_manwon   IS NOT NULL AND
      center_name    IS NOT NULL AND
      region_detail  IS NOT NULL AND
      length(btrim(region_detail)) > 0
    )
  );
