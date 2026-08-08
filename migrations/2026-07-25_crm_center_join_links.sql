-- 센터별 회원가입 QR/링크. QR 스캔 → /join/{token} 랜딩 → 앱 설치·실행 시 이 센터로 가입 연결.
-- 센터당 1개 활성 링크(재발급 시 교체). code 는 사람이 입력하는 6자리 대체 코드.
CREATE TABLE IF NOT EXISTS crm_center_join_links (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  center_id  bigint NOT NULL UNIQUE,
  token      text   NOT NULL UNIQUE,
  code       text   NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_join_links_token ON crm_center_join_links (token);
CREATE INDEX IF NOT EXISTS idx_crm_join_links_code  ON crm_center_join_links (code);
