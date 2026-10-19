-- PT 상담지: 수분·카페인·음주·흡연 칸을 숫자 전용 → 자유 입력(글자)으로 변경
--   "하루 2리터", "아메리카노 2잔", "소주 1병", "반 갑" 처럼 적을 수 있어야 한다는 요청.
--   기존 숫자 값은 글자로 그대로 옮긴다(0.50 → '0.5', 2 → '2회').
--
-- 되돌리기(필요 시):
--   ALTER TABLE crm_pt_consultations
--     ALTER COLUMN water_liters_per_day  TYPE NUMERIC(4,2) USING NULLIF(regexp_replace(water_liters_per_day,  '[^0-9.]', '', 'g'), '')::numeric,
--     ALTER COLUMN caffeine_cups_per_day TYPE INTEGER      USING NULLIF(regexp_replace(caffeine_cups_per_day, '[^0-9]',  '', 'g'), '')::int,
--     ALTER COLUMN alcohol_count         TYPE INTEGER      USING NULLIF(regexp_replace(alcohol_count,         '[^0-9]',  '', 'g'), '')::int,
--     ALTER COLUMN cigarettes_per_day    TYPE INTEGER      USING NULLIF(regexp_replace(cigarettes_per_day,    '[^0-9]',  '', 'g'), '')::int;

BEGIN;

ALTER TABLE crm_pt_consultations
  ALTER COLUMN water_liters_per_day TYPE TEXT
    USING CASE WHEN water_liters_per_day IS NULL THEN NULL
               -- 3.00 → '3', 0.50 → '0.5' (FM 은 소수점을 남기므로 끝의 '.' 까지 떼어낸다)
               ELSE rtrim(rtrim(to_char(water_liters_per_day, 'FM9990.99'), '0'), '.') END,
  ALTER COLUMN caffeine_cups_per_day TYPE TEXT
    USING caffeine_cups_per_day::text,
  ALTER COLUMN alcohol_count TYPE TEXT
    USING CASE WHEN alcohol_count IS NULL THEN NULL
               ELSE alcohol_count::text || '회' END,
  ALTER COLUMN cigarettes_per_day TYPE TEXT
    USING cigarettes_per_day::text;

COMMIT;
