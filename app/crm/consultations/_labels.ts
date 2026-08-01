// PT 상담지 옵션 라벨 정의 — 폼과 상세 페이지에서 공용.

export const PAST_SPORTS = [
  { v: "health", l: "헬스/P.T" },
  { v: "crossfit", l: "크로스핏" },
  { v: "yoga", l: "요가/필라테스" },
  { v: "swim", l: "수영" },
  { v: "golf", l: "골프" },
] as const;

export const EXPERIENCE_LENGTHS = [
  { v: "none", l: "없음" },
  { v: "lt3m", l: "3개월 미만" },
  { v: "3-6m", l: "3개월~6개월" },
  { v: "6-12m", l: "6개월~1년" },
  { v: "gte1y", l: "1년 이상" },
] as const;

export const GOALS = [
  { v: "diet", l: "다이어트" },
  { v: "strength", l: "근력 향상" },
  { v: "posture", l: "체형 교정" },
  { v: "stamina", l: "기초 체력 향상" },
  { v: "muscle", l: "근육 증가" },
  { v: "pain", l: "통증 완화" },
  { v: "postpartum", l: "산후 관리" },
  { v: "athlete", l: "선수 트레이닝" },
  { v: "stress", l: "스트레스 해소" },
] as const;

export const MEAL_HABITS = [
  { v: "fullness", l: "포만감" },
  { v: "overeat", l: "과식" },
  { v: "binge", l: "폭식" },
  { v: "uncontrolled", l: "제어 불능" },
] as const;

export const PREFERRED_FOODS = [
  { v: "spicy_salty", l: "맵고 짠 음식" },
  { v: "sweet", l: "단 음식" },
  { v: "flour", l: "면/밀가루" },
  { v: "meat", l: "육류" },
  { v: "fish", l: "어류" },
  { v: "veg", l: "채소" },
] as const;

export const COMMUTES = [
  { v: "car", l: "자가용" },
  { v: "walk", l: "도보" },
  { v: "transit", l: "대중교통" },
  { v: "etc", l: "기타" },
] as const;

export const JOB_TRAITS = [
  { v: "heavy_lifting", l: "무거운 물건을 든다" },
  { v: "stairs", l: "계단을 자주 오르내린다" },
  { v: "overhead", l: "머리 위로 손을 올린다" },
  { v: "standing_long", l: "서 있는 시간이 길다" },
  { v: "sitting_long", l: "앉아 있는 시간이 길다" },
  { v: "driving_long", l: "운전하는 시간이 길다" },
] as const;

export const LEVELS = [
  { v: "high", l: "상" },
  { v: "mid", l: "중" },
  { v: "low", l: "하" },
] as const;

export const FATIGUE_WHEN = [
  { v: "morning", l: "아침" },
  { v: "noon", l: "점심" },
  { v: "evening", l: "저녁" },
  { v: "all_day", l: "하루종일" },
  { v: "none", l: "피로감 없음" },
] as const;

export const PAIN_PARTS = [
  { v: "waist", l: "허리" },
  { v: "shoulder", l: "어깨" },
  { v: "neck", l: "목" },
  { v: "knee", l: "무릎" },
  { v: "ankle", l: "발목" },
  { v: "elbow", l: "팔꿈치" },
  { v: "wrist", l: "손목" },
] as const;

export const CONDITIONS = [
  { v: "pregnancy", l: "임신" },
  { v: "heart", l: "심장병" },
  { v: "gallstone", l: "담석증" },
  { v: "fracture", l: "골절" },
  { v: "obesity", l: "비만" },
  { v: "cancer", l: "암" },
  { v: "stroke", l: "뇌졸중" },
  { v: "edema", l: "부종" },
  { v: "diabetes", l: "당뇨" },
  { v: "hypertension", l: "고혈압" },
  { v: "gynecology", l: "부인병" },
  { v: "kidney", l: "신장병" },
  { v: "fatty_liver", l: "지방간" },
  { v: "hyperlipidemia", l: "고지혈증" },
  { v: "palsy", l: "중풍" },
  { v: "arthritis", l: "관절염" },
  { v: "angina", l: "협심증" },
  { v: "arteriosclerosis", l: "동맥경화" },
  { v: "surgery", l: "수술" },
  { v: "rehab", l: "재활" },
] as const;

export const PLANNED_DAYS = [
  { v: "mon", l: "월" },
  { v: "tue", l: "화" },
  { v: "wed", l: "수" },
  { v: "thu", l: "목" },
  { v: "fri", l: "금" },
  { v: "sat", l: "토" },
  { v: "sun", l: "일" },
] as const;

export const CONSULT_STATUS_LABEL: Record<string, string> = {
  open: "진행중",
  converted: "PT 등록",
  lost: "미등록",
};

export const CONSULT_STATUS_COLOR: Record<string, string> = {
  open: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  converted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  lost: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
};
