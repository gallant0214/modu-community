-- CRM 모듈 #2: 회원
--
-- member_type 3종:
--   provisional = 가회원 (PDF 3-3, 휴대폰만으로 미리 등록)
--   full        = 정회원 (PDF 3-4, 관리자가 가입 대행 — moducm 사용자로 연결됨)
--   matched     = 매칭회원 (PDF 3-2, 이미 moducm 사용자인 사람을 검색해 매칭)
--
-- linked_firebase_uid 는 full/matched 에서만 채워짐.
-- 같은 센터 안에서 동일 전화번호 중복 허용 (실무에서 가족 등 케이스 있음 → UNIQUE 안 검).

CREATE TABLE IF NOT EXISTS crm_members (
  id                    BIGSERIAL PRIMARY KEY,
  center_id             BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  member_type           TEXT NOT NULL
                        CHECK (member_type IN ('provisional','full','matched')),
  name                  TEXT NOT NULL,
  phone                 TEXT NOT NULL,
  email                 TEXT,
  birth                 DATE,
  gender                TEXT CHECK (gender IN ('M','F','N')),
  linked_firebase_uid   TEXT,
  memo                  TEXT,
  status                TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','deleted')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 매칭/정회원은 firebase_uid 필수
ALTER TABLE crm_members
  DROP CONSTRAINT IF EXISTS chk_crm_members_linked_uid;
ALTER TABLE crm_members
  ADD CONSTRAINT chk_crm_members_linked_uid
  CHECK (
    member_type = 'provisional' OR linked_firebase_uid IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_crm_members_center_list
  ON crm_members (center_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_members_center_name
  ON crm_members (center_id, name);

CREATE INDEX IF NOT EXISTS idx_crm_members_center_phone
  ON crm_members (center_id, phone);

CREATE INDEX IF NOT EXISTS idx_crm_members_linked_uid
  ON crm_members (linked_firebase_uid)
  WHERE linked_firebase_uid IS NOT NULL;


-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION crm_members_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_members_updated_at ON crm_members;
CREATE TRIGGER trg_crm_members_updated_at
  BEFORE UPDATE ON crm_members
  FOR EACH ROW EXECUTE FUNCTION crm_members_set_updated_at();
