-- 카운터 결제 요청 — PG 가 연결되지 않은 센터의 이용권 구매 (2026-11-23)
--
-- 🚨 PG(온라인 카드 결제)는 스페셜바디 범어점(center_id 1)만 연결돼 있다.
--    나머지 센터는 회원이 앱·홈페이지에서 상품을 고르면 '카운터 결제 요청'으로 접수되고,
--    직원이 카운터에서 돈을 받은 뒤 CRM 에서 [결제완료 후 승인] 하면 이용권이 발급된다.

-- 센터별 PG 연결 여부 — 기본 꺼짐, 범어점만 켠다
alter table crm_centers add column if not exists pg_enabled boolean not null default false;
update crm_centers set pg_enabled = true where id = 1;

-- 주문의 카운터 결제 진행 상태
--   requested : 회원이 구매 요청 → 직원 승인 대기 (주문 status 는 pending 그대로)
--   approved  : 직원이 카운터에서 결제 받고 승인 → 발급 완료
--   canceled  : 직원이 요청 취소 (회원이 안 옴 등) → 주문 취소·쿠폰·마일리지 반환
alter table crm_orders add column if not exists counter_state text
  check (counter_state is null or counter_state in ('requested', 'approved', 'canceled'));
alter table crm_orders add column if not exists counter_requested_at timestamptz;
alter table crm_orders add column if not exists counter_resolved_at timestamptz;
alter table crm_orders add column if not exists counter_resolved_by text;
alter table crm_orders add column if not exists counter_cancel_reason text;

create index if not exists crm_orders_counter_requested_idx
  on crm_orders (center_id, counter_requested_at)
  where counter_state = 'requested';
