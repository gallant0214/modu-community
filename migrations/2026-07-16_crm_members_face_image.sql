-- 회원 얼굴 사진 (프론트 압축 후 base64 data URL 저장).
-- 300x300 JPEG q=0.75 기준 ~15-30KB. 목록 조회 시엔 이 컬럼 select 제외.
ALTER TABLE crm_members
  ADD COLUMN IF NOT EXISTS face_image_data TEXT;
