-- 쿠폰 '삭제' = status 'deleted' (소프트 삭제)
-- 목록·보관함·발송·자동발급에서 빠지고, 회원이 이미 받은 쿠폰은 기한까지 그대로 쓸 수 있다.
-- 행을 지우지 않는 이유: crm_coupon_issues/crm_coupon_sends 가 coupon_id 로 참조하고(FK),
-- 받은 쿠폰의 혜택 계산·이력 표시에 쿠폰 정의가 계속 필요하다.
ALTER TABLE crm_coupons DROP CONSTRAINT IF EXISTS crm_coupons_status_check;
ALTER TABLE crm_coupons ADD CONSTRAINT crm_coupons_status_check
  CHECK (status = ANY (ARRAY['active'::text, 'archived'::text, 'deleted'::text]));
