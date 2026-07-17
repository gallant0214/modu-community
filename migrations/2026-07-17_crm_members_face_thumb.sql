-- 목록에서 회원 이름 옆에 표시할 소형 얼굴 썸네일.
-- 48x48 JPEG q=0.5 ~ 1-2KB base64 로 압축해 저장. 상세 페이지는 기존 face_image_data 사용.
ALTER TABLE crm_members
  ADD COLUMN IF NOT EXISTS face_image_thumb TEXT;
