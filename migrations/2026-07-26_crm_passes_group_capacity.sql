-- 그룹 수업 수강권: 발급 시 상품(정원) 스냅샷
-- 목적: 스케줄 예약 화면에서 그룹 수강권을 선택하면 정원(capacity) 만큼 참가자(회원)를
--       한 슬롯에 함께 예약할 수 있도록 pass 에 capacity 정보를 남긴다.
--       product 카탈로그가 나중에 삭제/변경되더라도 이미 발급된 pass 에는 그대로 유지되도록 스냅샷.
BEGIN;

ALTER TABLE crm_passes
  ADD COLUMN IF NOT EXISTS product_id BIGINT
    REFERENCES crm_products(id) ON DELETE SET NULL;

ALTER TABLE crm_passes
  ADD COLUMN IF NOT EXISTS group_capacity INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN crm_passes.product_id IS
  '발급 시점의 원본 상품(참조 목적). NULL 은 상품 없이 즉석 발급';
COMMENT ON COLUMN crm_passes.group_capacity IS
  '그룹 수업 수강권일 때 함께 예약 가능한 정원 (개인 레슨=1)';

CREATE INDEX IF NOT EXISTS idx_crm_passes_group_capacity
  ON crm_passes (center_id, group_capacity)
  WHERE group_capacity > 1;

COMMIT;
