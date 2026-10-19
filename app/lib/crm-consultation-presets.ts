/**
 * PT 상담지 '제공된 양식' — 한 번 누르면 질문 세트가 통째로 들어간다.
 *
 * 기본 양식(= 지금 쓰는 스페셜바디 상담지)으로 부족할 때, 목적별 질문 묶음을 골라 붙이는 용도.
 * 여기 적힌 key 는 붙여 넣을 때 새로 만들어지므로(겹치면 뒤에 번호가 붙는다) 참고용 이름이면 된다.
 */
import type { CustomSection } from "./crm-consultation-template";

export interface ConsultationPreset {
  id: string;
  name: string;
  summary: string;
  sections: CustomSection[];
}

export const CONSULTATION_PRESETS: ConsultationPreset[] = [
  {
    id: "diet",
    name: "식단·영양 심화",
    summary: "식습관을 더 자세히 물어보는 질문 8개",
    sections: [
      {
        key: "diet_deep",
        title: "식단 상세",
        fields: [
          { key: "diet_goal", type: "chips_single", label: "식단 목표", options: [
            { v: "loss", l: "체중 감량" }, { v: "gain", l: "증량" },
            { v: "maintain", l: "유지" }, { v: "health", l: "건강 개선" },
          ] },
          { key: "cook_yn", type: "chips_single", label: "직접 요리하시나요?", options: [
            { v: "self", l: "직접 해요" }, { v: "deliver", l: "배달·외식 위주" },
            { v: "mix", l: "반반" },
          ] },
          { key: "meal_count", type: "chips_single", label: "하루 식사 횟수", options: [
            { v: "1", l: "1끼" }, { v: "2", l: "2끼" }, { v: "3", l: "3끼" }, { v: "4", l: "4끼 이상" },
          ] },
          { key: "snack", type: "text", label: "간식·야식", placeholder: "예: 저녁 늦게 빵 자주" },
          { key: "allergy", type: "text", label: "알레르기·못 먹는 음식" },
          { key: "protein_intake", type: "text", label: "단백질 섭취", placeholder: "예: 닭가슴살 하루 1팩" },
          { key: "diet_budget", type: "text", label: "식비 여건", placeholder: "예: 도시락 준비 어려움" },
          { key: "diet_note", type: "textarea", label: "식단에서 가장 어려운 점" },
        ],
      },
    ],
  },
  {
    id: "posture",
    name: "체형·자세 평가",
    summary: "체형 측정과 자세 평가 기록용 질문 7개",
    sections: [
      {
        key: "posture",
        title: "체형·자세 평가",
        fields: [
          { key: "height_cm", type: "number", label: "키 (cm)" },
          { key: "weight_kg", type: "number", label: "몸무게 (kg)" },
          { key: "body_fat", type: "text", label: "체지방률 / 골격근량", placeholder: "예: 28% / 24kg" },
          { key: "posture_type", type: "chips_multi", label: "눈에 띄는 체형", options: [
            { v: "forward_head", l: "거북목" }, { v: "round_shoulder", l: "라운드숄더" },
            { v: "sway_back", l: "골반 전방경사" }, { v: "flat_back", l: "일자 허리" },
            { v: "scoliosis", l: "척추 측만" }, { v: "knee_in", l: "X·O 다리" },
          ] },
          { key: "rom_limit", type: "text", label: "가동범위 제한", placeholder: "예: 어깨 굴곡 제한" },
          { key: "balance_test", type: "text", label: "균형·기능 테스트 결과" },
          { key: "posture_note", type: "textarea", label: "평가 메모" },
        ],
      },
    ],
  },
  {
    id: "renew",
    name: "재등록 상담",
    summary: "기존 회원 재등록 때 묻는 질문 6개",
    sections: [
      {
        key: "renew",
        title: "재등록 상담",
        fields: [
          { key: "satisfaction", type: "chips_single", label: "지난 기간 만족도", options: [
            { v: "5", l: "매우 만족" }, { v: "4", l: "만족" }, { v: "3", l: "보통" },
            { v: "2", l: "아쉬움" }, { v: "1", l: "불만" },
          ] },
          { key: "result_check", type: "textarea", label: "지난 목표 달성 정도" },
          { key: "next_goal", type: "text", label: "다음 기간 목표" },
          { key: "keep_trainer", type: "chips_single", label: "담당 강사", options: [
            { v: "keep", l: "그대로" }, { v: "change", l: "변경 희망" },
          ] },
          { key: "renew_barrier", type: "text", label: "재등록을 망설이는 점" },
          { key: "renew_note", type: "textarea", label: "요청 사항" },
        ],
      },
    ],
  },
  {
    id: "profile",
    name: "바디프로필 준비",
    summary: "촬영 일정과 감량 계획 질문 6개",
    sections: [
      {
        key: "bodyprofile",
        title: "바디프로필 준비",
        fields: [
          { key: "shoot_date", type: "date", label: "촬영 예정일" },
          { key: "shoot_concept", type: "text", label: "콘셉트·참고 이미지" },
          { key: "target_weight", type: "text", label: "목표 체중·체지방" },
          { key: "diet_strict", type: "chips_single", label: "식단 강도", options: [
            { v: "strict", l: "엄격하게" }, { v: "normal", l: "보통" }, { v: "loose", l: "느슨하게" },
          ] },
          { key: "supplement_plan", type: "text", label: "보조제 계획" },
          { key: "profile_note", type: "textarea", label: "특이사항" },
        ],
      },
    ],
  },
  {
    id: "consent",
    name: "동의·확인 사항",
    summary: "촬영·연락·환불 규정 동의 질문 5개",
    sections: [
      {
        key: "consents",
        title: "동의 · 확인 사항",
        fields: [
          { key: "rule_consent", type: "toggle", label: "센터 이용 규정을 안내받았습니다", required: true },
          { key: "refund_consent", type: "toggle", label: "환불 규정을 안내받았습니다", required: true },
          { key: "photo_consent", type: "toggle", label: "운동 사진·영상 촬영에 동의합니다" },
          { key: "marketing_consent", type: "toggle", label: "이벤트·혜택 안내 수신에 동의합니다" },
          { key: "consent_note", type: "text", label: "안내한 직원 / 메모" },
        ],
      },
    ],
  },
];
