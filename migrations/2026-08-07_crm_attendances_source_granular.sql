-- 출석 source 를 세분화해 '터치(번호)' 와 '터치(얼굴)' 을 구분 저장.
-- 기존 'touch' 값도 그대로 보존 (구식 데이터).

ALTER TABLE crm_attendances DROP CONSTRAINT IF EXISTS crm_attendances_source_check;
ALTER TABLE crm_attendances ADD CONSTRAINT crm_attendances_source_check
  CHECK (source = ANY (ARRAY[
    'kiosk'::text,
    'manual'::text,
    'app'::text,
    'touch'::text,        -- legacy (미구분 저장)
    'touch_number'::text, -- 터치출석 · 출석번호 입력
    'touch_face'::text    -- 터치출석 · 얼굴 인식
  ]));
