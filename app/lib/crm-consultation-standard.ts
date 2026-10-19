import type { CustomFieldOption } from "./crm-consultation-template";
import {
  PAST_SPORTS,
  EXPERIENCE_LENGTHS,
  GOALS,
  MEAL_HABITS,
  PREFERRED_FOODS,
  COMMUTES,
  JOB_TRAITS,
  LEVELS,
  FATIGUE_WHEN,
  PAIN_PARTS,
  CONDITIONS,
  PLANNED_DAYS,
  SAFETY_FLAGS,
  EXERCISE_BARRIERS,
  COACHING_STYLES,
  CONTACT_METHODS,
} from "@/app/crm/consultations/_labels";

/**
 * PT 상담지 '기본 양식'(표준 섹션) 목록.
 *
 * 🚨 이 파일은 consultation-form.tsx 가 실제로 그리는 섹션·항목을 그대로 적어 둔 목록이다.
 *    상담지 관리 화면이 이걸 읽어 "지금 양식"을 보여주고, 센터가 항목을 숨기거나
 *    이름을 바꾸거나 순서를 옮기면 그 결과만 템플릿 definition.standard_overrides 에 저장한다.
 *    (답변이 들어가는 DB 컬럼은 그대로라 예전 상담 기록과 100% 호환된다.)
 *
 *    폼에 섹션·항목을 새로 추가하면 여기에도 같은 key 로 추가해야 관리 화면에 보인다.
 *    key = 답변이 저장되는 위치(컬럼명 또는 'json컬럼.속성').
 */

export interface StandardField {
  key: string;
  label: string;
}
export interface StandardSection {
  key: string;
  title: string;
  fields: StandardField[];
}

export const STANDARD_SECTIONS: StandardSection[] = [
  {
    "key": "exercise",
    "title": "운동 경험",
    "fields": [
      {
        "key": "recent_year_history",
        "label": "최근 1년간 운동 경력"
      },
      {
        "key": "past_sports",
        "label": "과거 운동 종목"
      },
      {
        "key": "experience_length",
        "label": "운동 경력"
      },
      {
        "key": "motivation",
        "label": "운동 동기 / 계기"
      },
      {
        "key": "goals",
        "label": "목표"
      },
      {
        "key": "goal_details.primary_goal",
        "label": "가장 중요한 1순위 목표"
      },
      {
        "key": "goal_details.deadline",
        "label": "목표 기한"
      },
      {
        "key": "goal_details.current_metric",
        "label": "현재 상태·수치 (선택)"
      },
      {
        "key": "goal_details.target_metric",
        "label": "목표 상태·수치 (선택)"
      },
      {
        "key": "goal_details.importance",
        "label": "목표 중요도"
      },
      {
        "key": "goal_details.confidence",
        "label": "달성 자신감"
      },
      {
        "key": "goal_details.success_criteria",
        "label": "성공했다고 판단할 기준"
      },
      {
        "key": "workout_method",
        "label": "운동 방법"
      },
      {
        "key": "preferred_trainer",
        "label": "희망 트레이너"
      },
      {
        "key": "referral_source",
        "label": "유입 경로"
      }
    ]
  },
  {
    "key": "nutrition",
    "title": "영양",
    "fields": [
      {
        "key": "meal_habits",
        "label": "식사 습관"
      },
      {
        "key": "preferred_foods",
        "label": "선호 음식"
      },
      {
        "key": "water_liters_per_day",
        "label": "수분 섭취"
      },
      {
        "key": "caffeine_cups_per_day",
        "label": "카페인 (커피)"
      },
      {
        "key": "alcohol_period",
        "label": "음주 주기"
      },
      {
        "key": "smoking",
        "label": "흡연"
      },
      {
        "key": "supplements",
        "label": "섭취 중인 영양제"
      },
      {
        "key": "diet_experience",
        "label": "식단 경험"
      }
    ]
  },
  {
    "key": "work",
    "title": "근무 패턴",
    "fields": [
      {
        "key": "job",
        "label": "직업"
      },
      {
        "key": "work_hours_start",
        "label": "근무 시간"
      },
      {
        "key": "commute",
        "label": "출퇴근 수단"
      },
      {
        "key": "job_traits",
        "label": "직업 형태"
      },
      {
        "key": "work_notes",
        "label": "기타 사항"
      }
    ]
  },
  {
    "key": "condition",
    "title": "컨디션",
    "fields": [
      {
        "key": "wake_hour",
        "label": "기상 시간"
      },
      {
        "key": "sleep_hour",
        "label": "취침 시간"
      },
      {
        "key": "sleep_satisfaction",
        "label": "수면 만족도"
      },
      {
        "key": "condition_score",
        "label": "컨디션 지수"
      },
      {
        "key": "fatigue_when",
        "label": "피로도 시점"
      },
      {
        "key": "fatigue_reason",
        "label": "피로도 원인"
      },
      {
        "key": "condition_notes",
        "label": "기타 사항"
      }
    ]
  },
  {
    "key": "safety",
    "title": "운동 전 안전 확인",
    "fields": [
      {
        "key": "safety_screening.flags",
        "label": "현재 또는 최근 경험한 항목"
      },
      {
        "key": "safety_screening.clearance_status",
        "label": "의료진 운동 확인 상태"
      },
      {
        "key": "safety_screening.clearance_date",
        "label": "확인일"
      },
      {
        "key": "safety_screening.precautions",
        "label": "의료진 주의사항·운동 제한"
      }
    ]
  },
  {
    "key": "pain",
    "title": "통증 체크",
    "fields": [
      {
        "key": "injury_history",
        "label": "부상 경험"
      },
      {
        "key": "pain_parts",
        "label": "통증 부위"
      },
      {
        "key": "pain_details.intensity",
        "label": "통증 강도 (0~10)"
      },
      {
        "key": "pain_details.side",
        "label": "방향"
      },
      {
        "key": "pain_details.onset",
        "label": "시작 시점"
      },
      {
        "key": "pain_details.trigger",
        "label": "통증이 발생하는 동작"
      },
      {
        "key": "pain_details.avoid",
        "label": "피해야 하는 동작"
      },
      {
        "key": "pain_details.diagnosis",
        "label": "병원 진단명"
      },
      {
        "key": "pain_details.treatment",
        "label": "치료·재활 상태"
      }
    ]
  },
  {
    "key": "history",
    "title": "과거 / 현재 병력",
    "fields": [
      {
        "key": "conditions_past",
        "label": "과거 병력"
      },
      {
        "key": "conditions",
        "label": "현재 병력"
      },
      {
        "key": "medications",
        "label": "약물 복용 여부"
      },
      {
        "key": "current_state",
        "label": "현재 상태"
      }
    ]
  },
  {
    "key": "plan",
    "title": "운동 계획",
    "fields": [
      {
        "key": "weekly_freq",
        "label": "주 몇 회"
      },
      {
        "key": "planned_time",
        "label": "원하는 시간대"
      },
      {
        "key": "planned_days",
        "label": "요일"
      }
    ]
  },
  {
    "key": "adherence",
    "title": "운동 지속 및 지도 선호",
    "fields": [
      {
        "key": "adherence_details.barriers",
        "label": "운동 지속을 방해할 수 있는 요인"
      },
      {
        "key": "adherence_details.dropout_reason",
        "label": "이전 운동을 중단한 가장 큰 이유"
      },
      {
        "key": "adherence_details.support_needed",
        "label": "운동을 지속하기 위해 필요한 도움"
      },
      {
        "key": "coaching_preferences.styles",
        "label": "선호하는 지도 방식"
      },
      {
        "key": "coaching_preferences.touch_consent",
        "label": "자세 교정을 위한 신체 접촉 동의"
      },
      {
        "key": "coaching_preferences.media_consent",
        "label": "자세 확인용 사진·영상 촬영 동의"
      }
    ]
  },
  {
    "key": "request",
    "title": "강사에게 바라는 점 또는 요청 사항",
    "fields": []
  },
  {
    "key": "followup",
    "title": "상담 후속 관리",
    "fields": [
      {
        "key": "follow_up_details.desired_start_date",
        "label": "운동 시작 희망일"
      },
      {
        "key": "follow_up_details.interested_sessions",
        "label": "관심 수업 횟수"
      },
      {
        "key": "follow_up_details.preferred_contact",
        "label": "선호 연락 방식"
      },
      {
        "key": "follow_up_details.contact_time",
        "label": "연락 가능한 시간"
      },
      {
        "key": "follow_up_details.follow_up_date",
        "label": "다음 연락 예정일"
      },
      {
        "key": "follow_up_details.lead_temperature",
        "label": "등록 가능성"
      },
      {
        "key": "follow_up_details.hesitation_reason",
        "label": "등록을 망설이는 이유"
      },
      {
        "key": "follow_up_details.follow_up_note",
        "label": "다음 연락·상담 내용"
      }
    ]
  }
];

export const STANDARD_SECTION_KEYS = STANDARD_SECTIONS.map((s) => s.key);

/** 섹션 순서 설정을 실제 표시 순서로 — 설정에 없는(새로 추가된) 섹션은 원래 자리 뒤에 붙인다. */
export function orderedSectionKeys(order?: string[] | null): string[] {
  const base = STANDARD_SECTION_KEYS;
  if (!order || order.length === 0) return base;
  const known = order.filter((k) => base.includes(k));
  return [...known, ...base.filter((k) => !known.includes(k))];
}

/* ── 객관식 버튼(칩)이 달린 표준 문항 ────────────────────────────────
   key → 기본 버튼 목록. 상담지 관리에서 이 목록을 고치면
   definition.standard_overrides.field_options 에 '고친 전체 목록' 이 저장되고,
   상담지 폼의 ChipList 가 그 목록을 대신 쓴다.
   🚨 버튼의 v(저장값)는 건드리지 않는다 — 과거 답변이 그 값으로 저장돼 있다. */
export const STANDARD_FIELD_OPTIONS: Record<string, readonly CustomFieldOption[]> = {
  past_sports: PAST_SPORTS,
  experience_length: EXPERIENCE_LENGTHS,
  goals: GOALS,
  meal_habits: MEAL_HABITS,
  preferred_foods: PREFERRED_FOODS,
  commute: COMMUTES,
  job_traits: JOB_TRAITS,
  sleep_satisfaction: LEVELS,
  condition_score: LEVELS,
  fatigue_when: FATIGUE_WHEN,
  "safety_screening.flags": SAFETY_FLAGS,
  pain_parts: PAIN_PARTS,
  conditions_past: CONDITIONS,
  conditions: CONDITIONS,
  planned_days: PLANNED_DAYS,
  "adherence_details.barriers": EXERCISE_BARRIERS,
  "coaching_preferences.styles": COACHING_STYLES,
  "follow_up_details.preferred_contact": CONTACT_METHODS,
};
