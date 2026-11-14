-- 외부 연동 API 키 (조회 전용) — 엑셀·구글 시트·자동화 도구가 센터 데이터를 가져갈 때 쓴다 (2026-11-14)
-- key_hash: 키 원문의 SHA-256(hex). 원문은 저장하지 않고 발급 직후 화면에 한 번만 보여 준다.
-- key_prefix: 목록에서 키를 구분하는 앞부분(예: mcm_Ab3dE9xY). 이것만으로는 인증 불가.
-- scopes: 볼 수 있는 데이터 — 'members'(회원·이용권) / 'sales'(매출·결제)
-- created_by_uid: 만든 직원. 그 직원이 퇴사하거나 권한을 잃으면 키도 함께 막힌다.
-- revoked_at: 폐기 시각(행은 기록으로 남김). NULL = 사용 중
CREATE TABLE IF NOT EXISTS crm_api_keys (
  id bigserial PRIMARY KEY,
  center_id bigint NOT NULL REFERENCES crm_centers(id),
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL,
  created_by_uid text NOT NULL,
  created_by_member_id bigint REFERENCES crm_center_members(id),
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  last_used_ip text,
  revoked_at timestamptz,
  revoked_by_uid text,
  CONSTRAINT crm_api_keys_scopes_check CHECK (
    cardinality(scopes) > 0 AND scopes <@ ARRAY['members', 'sales']::text[]
  )
);
CREATE INDEX IF NOT EXISTS crm_api_keys_center_idx ON crm_api_keys(center_id);
COMMENT ON TABLE crm_api_keys IS '외부 연동 API 키(조회 전용). 원문 미저장 — key_hash(SHA-256)로 조회';
-- 서버(service role)만 읽고 쓴다. 혹시 공개 키로 접근해도 아무 행도 안 보이게 RLS 를 켜 둔다(정책 없음).
ALTER TABLE crm_api_keys ENABLE ROW LEVEL SECURITY;
