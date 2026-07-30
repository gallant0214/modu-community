-- 터치출석: 얼굴 인식 정밀도(임계값) 설정 컬럼
-- 값이 작을수록 엄격 (오인식 감소), 클수록 관대 (본인 인식률 증가)
-- 권장 범위 0.42 ~ 0.48. 슬라이더 범위 0.35 ~ 0.60.

ALTER TABLE crm_touch_attendance_settings
  ADD COLUMN IF NOT EXISTS face_threshold NUMERIC(4,2) NOT NULL DEFAULT 0.45;
