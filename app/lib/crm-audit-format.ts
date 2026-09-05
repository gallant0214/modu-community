/**
 * CRM 활동 로그(crm_audit_logs) 를 사람이 읽는 한글로 변환하는 공용 포매터.
 * 회원 상세 로그탭 / 회원목록 활동로그 / 설정 활동로그 등 CRM 의 모든 로그 표시에서 사용.
 * 원칙: 화면에는 무조건 한글 요약만 노출한다 (raw action key / 영문 payload 필드명 노출 금지).
 */

/** action key → 한글 작업명 */
export const ACTION_LABEL: Record<string, string> = {
  // 회원
  "member.create": "회원 등록",
  "member.update": "회원 정보 수정",
  "member.delete": "회원 삭제",
  "member.face_register": "얼굴 등록",
  "member.app_unlink": "앱 연동 해제",
  "members.bulk_hold": "회원 일괄 홀딩",
  "members.bulk_unhold": "회원 일괄 홀딩 해제",
  "members.bulk_extend": "회원 일괄 기간 연장",
  "members.bulk_mileage": "회원 일괄 마일리지 지급",
  // 수강권 / 회원권 / 대여권
  "pass.issue": "수강권 발급",
  "pass.update": "수강권 수정",
  "pass.refund": "수강권 환불",
  "membership.issue": "회원권 발급",
  "membership.update": "회원권 수정",
  "membership.refund": "회원권 환불",
  "rental.issue": "대여권/락커 발급",
  "rental.update": "대여권 수정",
  "rental.refund": "대여권 환불",
  // 결제
  "payment.create": "결제 추가",
  "payment.add": "결제 추가",
  "payment.update": "결제 수정",
  "payment.delete": "결제 삭제(구매취소)",
  // 홀딩(일시정지)
  "pause.create": "홀딩 시작",
  "pause.update": "홀딩 수정",
  "pause.cancel": "홀딩 해제",
  // 예약 / 출석
  "reservation.book": "예약 생성",
  "reservation.update": "예약 상태 변경",
  "reservation.reschedule": "예약 시간 이동",
  "reservation.cancel": "예약 취소",
  "reservation.cancelled": "예약 취소",
  "reservation.attended": "출석 처리",
  "reservation.noshow": "노쇼 처리",
  "attendance.cancel": "출석 취소",
  "attendance.check_in": "출석 체크인",
  "measurement.create": "신체 측정 기록",
  // 락커
  "locker.assign": "락커 배정",
  "locker.return": "락커 회수",
  "locker_zone.update": "락커룸 수정",
  "locker_layout.save": "락커 배치 저장",
  assign: "락커 배정",
  return: "락커 회수",
  returned: "락커 회수",
  reverted: "락커 기간 원복",
  move: "락커 이동",
  broken: "락커 고장 처리",
  repaired: "락커 고장 해제",
  // 계약서
  "contract.create": "계약서 작성",
  "contract.delete": "계약서 삭제",
  "contract.request": "계약서 발송",
  "contract.sign": "계약서 서명",
  "contract.void": "계약서 무효",
  // 직원 / 직급 / 권한
  "staff.add": "직원 추가",
  "staff.delete": "직원 삭제",
  "staff.update": "직원 정보 수정",
  "staff.reactivate": "직원 복직",
  "staff.join_approve": "가입 요청 승인",
  "staff.join_reject": "가입 요청 거절",
  "staff.permissions.update": "직원 권한 수정",
  approve: "승인",
  reject: "거절",
  "grade.create": "직급 추가",
  "grade.update": "직급 수정",
  "grade.delete": "직급 삭제",
  "grade_permission.update": "직급 권한 수정",
  "role_permission.update": "직급 권한 수정",
  // 상품 / 거래처 / 지출·수입
  "product.create": "상품 추가",
  "product.update": "상품 수정",
  "product.delete": "상품 삭제",
  "staff.remove": "직원 삭제",
  "vendor.create": "거래처 추가",
  "additional_income.create": "기타 수입 추가",
  "additional_income.update": "기타 수입 수정",
  "additional_income.delete": "기타 수입 삭제",
  "additional_expense.create": "기타 지출 추가",
  "additional_expense.update": "기타 지출 수정",
  "additional_expense.delete": "기타 지출 삭제",
  "fixed_expense.create": "고정 지출 추가",
  "fixed_expense.update": "고정 지출 수정",
  "fixed_expense.delete": "고정 지출 삭제",
  "payout_rule.create": "급여 규칙 생성",
  // 메시지 / 자동메시지 / 공지
  "message.send": "메시지 발송",
  "message.broadcast": "메시지 발송",
  "auto_message.update": "자동 메시지 설정",
  "auto_message.run": "자동 메시지 실행",
  "notice.create": "공지 작성",
  // 상담
  "consultation_template.create": "상담지 양식 추가",
  "consultation_template.update": "상담지 양식 수정",
  "consultation_template.delete": "상담지 양식 삭제",
  "pt_consultation.create": "PT 상담 작성",
  "pt_consultation.update": "PT 상담 수정",
  "pt_consultation.delete": "PT 상담 삭제",
  // 스케줄 / 운동기록
  "schedule_event.create": "일정 추가",
  "schedule_event.update": "일정 수정",
  "workout_log.create": "운동기록 작성",
  // 센터 / 설정 / 링크
  "settings.update": "설정 변경",
  "center.profile.update": "센터 정보 수정",
  "center.transfer": "센터 양도",
  "join_link.regenerate": "가입 링크 재발급",
  "kiosk_link.regenerate": "출석 링크 재발급",
  "attendance_voice.rules.replace": "출석 음성 안내 설정",
  "touch_attendance.settings.update": "터치출석 설정 변경",
  update: "수정",
};

/** action → 한글 작업명 (미매핑도 최대한 한글화 시도) */
export function actionLabel(action: string): string {
  if (ACTION_LABEL[action]) return ACTION_LABEL[action];
  // 미등록 action 도 xxx.create/update/delete 패턴이면 한글 접미사로 근사
  const suffix: Record<string, string> = { create: "추가", update: "수정", delete: "삭제", cancel: "취소" };
  const tail = action.split(".").pop() ?? action;
  return suffix[tail] ? `${suffix[tail]} 작업` : action;
}

/** payload 필드명 → 한글 라벨 */
export const LOG_FIELD_LABEL: Record<string, string> = {
  name: "이름", phone: "연락처", email: "이메일", birth: "생년월일", gender: "성별",
  address: "주소", counselor: "상담사", visit_route: "방문 경로", workout_goal: "운동 목적",
  memo: "메모", note: "메모", registration_type: "신규/재등록", registered_at: "등록일",
  first_use_at: "이용 시작일", final_expire_at: "최종 만료일", last_purchase_at: "마지막 구매일",
  last_attended_at: "마지막 출석일", total_paid_won: "누적 결제", attendance_no: "출석번호",
  mileage: "마일리지", marketing_consent: "광고 수신", member_type: "회원 유형",
  face_image_data: "얼굴 사진", face_image_thumb: "얼굴 사진",
  price_won: "금액", amount_won: "금액", discount_won: "할인", expires_at: "만료일",
  start_date: "시작일", start: "시작일", end: "종료일", end_date: "종료일", purchased_at: "구매일",
  issued_at: "발급일", vat_included: "부가세", days: "홀딩 일수", extended_days: "연장 일수",
  reverted_days: "원복 일수", payment_method: "결제 수단", payment_method_custom: "결제 수단(기타)",
  seller_member_id: "판매자", trainer_member_id: "담당 강사", plan_name: "상품명",
  duration_days: "기간", item_name: "상품", total_sessions: "총 세션", remaining_sessions: "잔여 세션",
  session_minutes: "수업 시간", issue_type: "발급 유형", lesson_kind: "수업 종류",
  mileage_earned: "적립 마일리지", mileage_used: "사용 마일리지", co_trainer_ids: "추가 강사",
  reason: "사유", requested_by: "요청자", count: "대상",
};

const LOG_MONEY_FIELDS = new Set(["price_won", "amount_won", "discount_won", "total_paid_won"]);
const LOG_IMAGE_FIELDS = new Set(["face_image_data", "face_image_thumb"]);
const LOG_ISSUE_TYPE: Record<string, string> = { new: "신규", renewal: "재등록", trial: "체험", service: "서비스" };
const LOG_PAYMENT_METHOD: Record<string, string> = { card: "카드", cash: "현금", transfer: "계좌이체", etc: "기타" };
const LOG_GENDER: Record<string, string> = { M: "남", F: "여", N: "미지정" };
// 화면 노출 불필요한 내부 필드(요약에서 숨김)
const LOG_HIDDEN_FIELDS = new Set([
  "member_id", "id", "kind", "had_record", "uid", "actor", "actor_uid",
  "membership_id", "pass_id", "rental_id", "entity_id",
]);

/** payload → 사람이 읽는 한 줄 한글 요약 */
export function summarizeAuditLog(
  action: string,
  payload: unknown,
  nameOf: (id: unknown) => string
): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;

  const fmt = (field: string, v: unknown): string => {
    if (LOG_IMAGE_FIELDS.has(field)) return v ? "등록" : "삭제";
    if (v === null || v === undefined || v === "") return "없음";
    if (field.endsWith("_member_id")) return nameOf(v);
    if (LOG_MONEY_FIELDS.has(field)) return `${Number(v).toLocaleString()}원`;
    if (field === "vat_included") return v ? "포함" : "미포함";
    if (field === "marketing_consent") return v ? "동의" : "미동의";
    if (field === "payment_method") return LOG_PAYMENT_METHOD[String(v)] ?? String(v);
    if (field === "issue_type") return LOG_ISSUE_TYPE[String(v)] ?? String(v);
    if (field === "gender") return LOG_GENDER[String(v)] ?? String(v);
    if (typeof v === "boolean") return v ? "예" : "아니오";
    if (typeof v === "number") return v.toLocaleString();
    if (typeof v === "string") {
      if (v.startsWith("data:image")) return "등록";
      return v.length > 30 ? v.slice(0, 30) + "…" : v;
    }
    if (Array.isArray(v)) return `${v.length}명`;
    return "";
  };

  // 1) action 별 맞춤 요약 (가장 읽기 쉬운 형태)
  if (action === "pause.create" || action === "pause.update") {
    const range = [p.start ?? p.start_date, p.end ?? p.end_date].filter(Boolean).join(" ~ ");
    const days = p.days ?? p.extended_days;
    return [range, days != null ? `${days}일간 홀딩` : ""].filter(Boolean).join(" · ");
  }
  if (action === "pause.cancel") {
    const r = Number(p.reverted_days ?? 0);
    return r > 0 ? `만료일 ${r}일 원복` : "연장 원복 없음";
  }

  // 2) 회원 정보 수정: changes { field: {from, to} }
  const changes = p.changes as Record<string, { from: unknown; to: unknown }> | undefined;
  if (changes && Object.keys(changes).length > 0) {
    return Object.entries(changes)
      .map(([k, v]) => {
        const label = LOG_FIELD_LABEL[k] ?? k;
        if (LOG_IMAGE_FIELDS.has(k)) return `${label} ${v.to ? "변경" : "삭제"}`;
        return `${label} ${fmt(k, v.from)}→${fmt(k, v.to)}`;
      })
      .join(" · ");
  }

  // 3) 그 외 payload: 한글 라벨 요약 (내부 필드 숨김, 최대 5개)
  const parts = Object.entries(p)
    .filter(([k]) => !LOG_HIDDEN_FIELDS.has(k))
    .map(([k, v]) => {
      if (LOG_IMAGE_FIELDS.has(k)) return `${LOG_FIELD_LABEL[k] ?? k} ${v ? "변경" : "삭제"}`;
      const label = LOG_FIELD_LABEL[k];
      // 라벨이 없는(=내부용) 필드는 노출하지 않는다 (영문 필드명 노출 방지)
      if (!label) return "";
      return `${label} ${fmt(k, v)}`;
    })
    .filter(Boolean);
  return parts.slice(0, 5).join(" · ");
}
