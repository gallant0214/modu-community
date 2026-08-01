-- PT 상담지 (스페셜바디 PT상담지 스타일)
-- 종이 상담지를 대체 · 회원등록 여부와 무관하게 방문객도 상담 기록 가능
-- 상담 → PT 등록(수강권 발급) 전환률 추적을 위해 status/converted_pass_id 관리

CREATE TABLE IF NOT EXISTS crm_pt_consultations (
  id                     BIGSERIAL PRIMARY KEY,
  center_id              BIGINT NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,

  -- 상담 대상: 기존 회원 매칭 시 member_id, 아니면 name/phone 필수
  member_id              BIGINT REFERENCES crm_members(id) ON DELETE SET NULL,
  name                   TEXT NOT NULL,
  gender                 TEXT,                -- 'M' | 'F' | null
  birth                  DATE,
  phone                  TEXT,
  address_dong           TEXT,                -- 주소(동)

  -- 담당 상담 강사 (전환률 집계 기준)
  trainer_member_id      BIGINT REFERENCES crm_center_members(id) ON DELETE SET NULL,

  -- 운동 경험
  recent_year_history    TEXT,                -- 최근 1년간 운동 경력 (자유 입력)
  past_sports            JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ["health","crossfit","yoga","swim","golf","etc"]
  past_sports_etc        TEXT,
  experience_length      TEXT,                -- 'none' | 'lt3m' | '3-6m' | '6-12m' | 'gte1y'
  motivation             TEXT,                -- 운동 동기 / 계기
  goals                  JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ["diet","strength","posture","stamina","muscle","pain","postpartum","athlete","stress","etc"]
  goals_etc              TEXT,
  workout_method         TEXT,                -- 운동 방법 자유 서술
  preferred_trainer      TEXT,
  referral_source        TEXT,

  -- 영양
  meal_morning_time      TEXT,                -- HH:MM (자유)
  meal_morning_menu      TEXT,
  meal_lunch_time        TEXT,
  meal_lunch_menu        TEXT,
  meal_dinner_time       TEXT,
  meal_dinner_menu       TEXT,
  meal_habits            JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ["fullness","overeat","binge","uncontrolled"]
  preferred_foods        JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ["spicy_salty","sweet","flour","meat","fish","veg","etc"]
  preferred_foods_etc    TEXT,
  water_liters_per_day   NUMERIC(4,2),
  caffeine_cups_per_day  INTEGER,
  alcohol_period         TEXT,                -- '주' | '월' | null
  alcohol_count          INTEGER,
  smoking                BOOLEAN NOT NULL DEFAULT false,
  cigarettes_per_day     INTEGER,
  supplements            TEXT,                -- 섭취 중인 영양제
  diet_experience        BOOLEAN NOT NULL DEFAULT false,
  diet_experience_detail TEXT,

  -- 근무 패턴
  job                    TEXT,
  work_hours_start       TEXT,                -- HH:MM
  work_hours_end         TEXT,
  commute                TEXT,                -- 'car' | 'walk' | 'transit' | 'etc'
  job_traits             JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ["heavy_lifting","stairs","overhead","standing_long","sitting_long","driving_long"]
  work_notes             TEXT,

  -- 컨디션
  wake_hour              INTEGER,             -- 0~23
  sleep_hour             INTEGER,
  sleep_satisfaction     TEXT,                -- 'high' | 'mid' | 'low'
  condition_score        TEXT,                -- 'high' | 'mid' | 'low'
  fatigue_when           JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ["morning","noon","evening","all_day","none"]
  fatigue_reason         TEXT,
  condition_notes        TEXT,

  -- 통증 체크
  injury_history         TEXT,
  pain_parts             JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ["waist","shoulder","neck","knee","ankle","elbow","wrist"]
  pain_parts_etc         TEXT,

  -- 병력
  conditions             JSONB NOT NULL DEFAULT '[]'::jsonb,  -- 18종 병력 코드 배열
  medications            TEXT,                -- 약물 복용 여부/내용
  current_state          TEXT,                -- 현재 상태

  -- 운동 계획
  weekly_freq            INTEGER,             -- 주 N 회
  planned_days           JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ["mon","tue","wed","thu","fri","sat","sun"]
  planned_time           TEXT,                -- 원하는 시간대 자유 입력

  -- 트레이너에게 바라는 점
  request_note           TEXT,

  -- 상담 결과 / 전환 추적
  status                 TEXT NOT NULL DEFAULT 'open',    -- 'open'(진행 중) | 'converted'(PT 등록됨) | 'lost'(미등록)
  converted_at           TIMESTAMPTZ,
  converted_pass_id      BIGINT REFERENCES crm_passes(id) ON DELETE SET NULL,
  lost_reason            TEXT,

  memo                   TEXT,                -- 상담 시 기타 메모
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_uid         TEXT NOT NULL,
  consulted_at           DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX IF NOT EXISTS idx_crm_pt_consultations_center_list
  ON crm_pt_consultations (center_id, consulted_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_crm_pt_consultations_member
  ON crm_pt_consultations (member_id) WHERE member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_pt_consultations_trainer
  ON crm_pt_consultations (center_id, trainer_member_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_pt_consultations_status
  ON crm_pt_consultations (center_id, status, consulted_at DESC);
