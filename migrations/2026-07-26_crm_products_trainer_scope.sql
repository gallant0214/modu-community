-- CRM 개인 상품(수강권) — 강사 개인 카탈로그
-- 목적: 강사가 센터 판매 상품과 별개로 본인 개인 고객에게 판매할 수강권 상품 관리.
--       trainer_member_id 가 채워지면 그 강사만 조회·수정 가능한 개인 상품.
--       NULL 이면 기존과 동일한 센터 공용 상품.
BEGIN;

ALTER TABLE crm_products
  ADD COLUMN IF NOT EXISTS trainer_member_id BIGINT
    REFERENCES crm_center_members(id) ON DELETE CASCADE;

COMMENT ON COLUMN crm_products.trainer_member_id IS
  '개인 상품 소유 강사(crm_center_members.id). NULL 이면 센터 공용 상품';

CREATE INDEX IF NOT EXISTS idx_crm_products_trainer_scope
  ON crm_products (center_id, trainer_member_id, status, created_at DESC);

COMMIT;
