-- 상품(주로 헬스 이용권/회원권)에 하루 사용 제한 필드 추가.
--   daily_check_in_limit: 하루 출석 가능 횟수 (기본 1)
--   daily_time_limit_enabled: 하루 이용 가능 시간 제한 사용 여부 (기본 false)
--                             true 면 기존 open_time·close_time 이 실효 이용시간
ALTER TABLE crm_products
  ADD COLUMN IF NOT EXISTS daily_check_in_limit    INTEGER NOT NULL DEFAULT 1
                                                    CHECK (daily_check_in_limit >= 1),
  ADD COLUMN IF NOT EXISTS daily_time_limit_enabled BOOLEAN NOT NULL DEFAULT false;
