-- 환불하면 발급된 이용권도 함께 회수 (2026-09-24, 사용자 확정)
--
-- 결제내역의 '삭제' 버튼을 없애고 '환불'로 일원화한다.
-- 삭제는 결제 기록까지 통째로 지워서 원장이 사라졌다. 환불은 기록을 남기면서
-- 이용권만 회수한다.
--
-- 이용권을 지우면 crm_payments 가 CASCADE 로 함께 사라지므로, 연결을 먼저 끊는다.
-- 그러면 상품 연결이 0개가 되어 기존 CHECK 에 걸리기 때문에 두 가지를 준비한다.

-- ① 상품이 회수돼도 무엇에 대한 결제였는지 알 수 있도록 이름을 남긴다
ALTER TABLE crm_payments ADD COLUMN IF NOT EXISTS product_label text;

-- ② 환불된 결제는 상품 연결이 없어도 되게 한다
ALTER TABLE crm_payments DROP CONSTRAINT IF EXISTS crm_payments_check;
ALTER TABLE crm_payments ADD  CONSTRAINT crm_payments_check CHECK (
  ((pass_id IS NOT NULL)::integer + (membership_id IS NOT NULL)::integer + (rental_id IS NOT NULL)::integer) = 1
  OR order_id IS NOT NULL
  OR status = 'refunded'
);
