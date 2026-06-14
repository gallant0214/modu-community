/**
 * enum 키 → 한글 라벨 매핑 ([[feedback-korean-status-labels]] 룰)
 * DB enum 키는 영문 유지, 사용자 노출 텍스트는 항상 한글로 변환.
 */

export const ROLE_LABEL: Record<string, string> = {
  owner: "대표자",
  admin: "관리자",
  manager: "팀장",
  trainer: "강사",
};

export const ACCESS_LEVEL_LABEL: Record<string, string> = {
  admin: "관리자",
  schedule: "스케줄",
  none: "권한없음",
};

export const STATUS_LABEL: Record<string, string> = {
  active: "재직",
  inactive: "퇴사",
};

export const MEMBER_TYPE_LABEL: Record<string, string> = {
  provisional: "가회원",
  full: "정회원",
  matched: "매칭회원",
};

export const ISSUE_TYPE_LABEL: Record<string, string> = {
  new: "신규",
  renewal: "재등록",
  trial: "체험",
  service: "서비스",
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "현금",
  card: "카드",
  transfer: "계좌",
  custom: "직접입력",
  etc: "기타",
};

export const PASS_STATUS_LABEL: Record<string, string> = {
  valid: "유효",
  expired: "만료",
  refunded: "환불",
  deleted: "삭제",
};

export const RESERVATION_STATUS_LABEL: Record<string, string> = {
  booked: "예약완료",
  attended: "출석완료",
  cancelled: "예약취소",
  noshow: "노쇼",
};

export const ATTENDANCE_MODE_LABEL: Record<string, string> = {
  trainer: "트레이너 직접",
  owner_only: "관리자만",
};

export const GENDER_LABEL: Record<string, string> = {
  M: "남",
  F: "여",
  N: "기타",
};

/**
 * 회원 정보 매칭 (예약 화면 색상용 등) — 상태별 컬러 토큰
 */
export const RESERVATION_STATUS_COLOR: Record<
  string,
  { bg: string; text: string; dot: string }
> = {
  booked: {
    bg: "bg-[#F5E4C8] dark:bg-amber-950/40",
    text: "text-[#B47B2A] dark:text-amber-300",
    dot: "bg-[#B47B2A]",
  },
  attended: {
    bg: "bg-[#EFE7D5] dark:bg-[#6B7B3A]/20",
    text: "text-[#6B7B3A] dark:text-[#A8B87A]",
    dot: "bg-[#6B7B3A]",
  },
  cancelled: {
    bg: "bg-[#F5F0E5] dark:bg-zinc-800",
    text: "text-[#A89B80] dark:text-zinc-500",
    dot: "bg-[#A89B80]",
  },
  noshow: {
    bg: "bg-red-50 dark:bg-red-950/40",
    text: "text-red-700 dark:text-red-300",
    dot: "bg-red-500",
  },
};
