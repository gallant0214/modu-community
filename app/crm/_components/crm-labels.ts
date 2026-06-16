/**
 * enum 키 → 한글 라벨 매핑 ([[feedback-korean-status-labels]] 룰)
 * DB enum 키는 영문 유지, 사용자 노출 텍스트는 항상 한글로 변환.
 */

/** 천 단위 콤마 포맷 (예: 1234567 → "1,234,567") */
export function formatWon(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "string" ? Number(value.replace(/[^0-9]/g, "")) : value;
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("ko-KR");
}

/** 콤마/공백/문자 제거 후 정수. 비어있으면 0. */
export function parseWon(value: string): number {
  const cleaned = value.replace(/[^0-9]/g, "");
  return cleaned ? Number(cleaned) : 0;
}

/**
 * 한국 휴대폰 번호 하이픈 자동 포맷.
 *  - 3자리 이하: "010"
 *  - 4~6자리: "010-1234"
 *  - 7~10자리 (옛날 010-XXX-XXXX): "010-123-4567"
 *  - 11자리: "010-1234-5678"
 *  - 11자리 초과 입력은 잘림
 */
export function formatPhone(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length < 11) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

export const ROLE_LABEL: Record<string, string> = {
  owner: "대표자",
  admin: "관리자",
  manager: "팀장",
  trainer: "강사",
};

export const ACCESS_LEVEL_LABEL: Record<string, string> = {
  admin: "관리자",
  schedule: "스케줄",
  none: "강사",
};

export const STATUS_LABEL: Record<string, string> = {
  active: "재직",
  inactive: "퇴사",
};

export const EMPLOYMENT_STATUS_LABEL: Record<string, string> = {
  working: "재직중",
  on_leave: "휴직",
  resigned: "퇴사",
};

export const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  regular: "정규직",
  freelance: "프리랜서",
  part_time: "아르바이트",
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
  etc: "기타",
};

export const PASS_STATUS_LABEL: Record<string, string> = {
  valid: "유효",
  expired: "만료",
  refunded: "환불",
  deleted: "삭제",
};

export const CONTRACT_CATEGORY_LABEL: Record<string, string> = {
  purchase: "구매 계약서",
  transfer: "양도 계약서",
  refund: "환불 계약서",
  employment: "근로 계약서",
  etc: "기타 계약서",
};

export const RESERVATION_STATUS_LABEL: Record<string, string> = {
  booked: "예약완료",
  attended: "출석완료",
  cancelled: "예약취소",
  noshow: "노쇼",
};

export const ATTENDANCE_MODE_LABEL: Record<string, string> = {
  trainer: "강사 직접",
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
