-- 묶음 구성품 결제행 → 본품 결제행 연결 (2026-11-04)
--
-- 토스에서 묶음 주문(1개월 재등록 회원권 + 운동복)을 취소했더니 회원권·운동복은 회수됐는데
-- 회원권에 딸린 '1개월 락커(재등록)'(0원 구성품)만 유효로 남았다.
--
-- PG 취소 반영(applyPgCancel)은 주문 항목(crm_order_items)을 돌며 그 결제행을 회수한다.
-- 구성품은 항목이 아니라 본품 발급에 딸려 나가고, 결제행의 order_item_id 는 본품이 유니크로
-- 점유하고 있어 NULL 로 저장된다 → **어느 항목에 딸린 구성품인지 알 길이 없었다.**
--
-- 이 칸으로 본품 결제행을 가리켜, 본품이 회수될 때 딸린 구성품도 함께 회수한다.
-- 부분 취소(회원권만 취소하고 운동복은 유지)에서도 회원권의 락커만 정확히 따라간다.
--
-- 이 칸이 생기기 전에 만든 주문은 NULL 로 남는다(백필하지 않음). 그 주문들은
-- '주문 전체가 환불되면 그 주문의 살아있는 결제행을 모두 회수'하는 안전망이 맡는다.

alter table crm_payments
  add column if not exists bundle_parent_payment_id bigint
    references crm_payments(id) on delete set null;

create index if not exists idx_crm_payments_bundle_parent
  on crm_payments (bundle_parent_payment_id)
  where bundle_parent_payment_id is not null;
