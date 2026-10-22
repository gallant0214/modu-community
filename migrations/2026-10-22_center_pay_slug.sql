-- 센터별 결제창 주소 슬러그 (2026-10-22)
--
-- 결제 경로를 `/pay/[주문]` → `/store/[센터슬러그]/pay/[주문]` 로 옮긴다.
-- 이유: KG이니시스 심사에 제출할 주소를 상품 종류별로 분리해야 하고,
--       센터가 늘어나면 **센터마다 고유 결제 주소**가 필요하다(사용자 요구).
--
-- 🚨 최상단(`/[센터슬러그]/pay/...`)에 두지 않는다. 나중에 최상단 메뉴가 늘면
--    센터 슬러그와 충돌한다. `/shop/[slug]` 를 `/shop` 아래 둔 것과 같은 이유다.
--
-- shop_slug(추측 어려운 랜덤 12자)와 **용도가 다르다**:
--   shop_slug : 공개 판매 페이지 주소. 아무나 찾지 못하게 랜덤이어야 한다
--   pay_slug  : PG 심사에 제출하고 사람이 읽는 주소. 센터를 알아볼 수 있어야 한다
ALTER TABLE crm_centers ADD COLUMN IF NOT EXISTS pay_slug text;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_crm_centers_pay_slug
  ON crm_centers (pay_slug) WHERE pay_slug IS NOT NULL;

-- 스페셜바디 범어점(center 1) — 현재 유일한 온라인 판매 센터
UPDATE crm_centers SET pay_slug = 'specialbody', updated_at = now()
WHERE id = 1 AND pay_slug IS NULL;
