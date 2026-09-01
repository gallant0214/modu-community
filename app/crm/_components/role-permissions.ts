/**
 * CRM 직급별 권한 매트릭스 정의.
 * roles: 기본 역할 4종 (owner/admin/manager/trainer).
 * permissions: 카테고리 그룹별 권한키·라벨 + 기본값.
 * 기본값은 각 역할별로 최소 권한 원칙 + owner 는 항상 all.
 */

export interface RoleOption {
  key: "owner" | "admin" | "manager" | "trainer" | "fc" | "alba";
  label: string;
}

export const ROLE_COLS: RoleOption[] = [
  { key: "owner", label: "대표자" },
  { key: "admin", label: "관리자" },
  { key: "manager", label: "팀장" },
  { key: "trainer", label: "강사" },
];

export interface PermissionItem {
  key: string;
  label: string;
  /** 각 역할별 기본값 */
  defaults: Partial<Record<RoleOption["key"], boolean>>;
}

export interface PermissionGroup {
  key: string;
  label: string;
  items: PermissionItem[];
}

// 기본 권한 프로필 (6개 기반: 대표자/관리자/팀장/강사/FC/아르바이트)
// - 강사(trainer): 본인 담당 회원·수업 위주 최소 권한
// - FC(fc): 영업·상담·회원 등록/판매 담당 → 회원·판매 권한은 팀장 수준, 재무·설정·삭제는 차단
// - 아르바이트(alba): 프런트 조회 위주 최소(열람) 권한
const D_ALL = { owner: true, admin: true, manager: true, trainer: true, fc: true, alba: true };
const D_ADMIN = { owner: true, admin: true, manager: false, trainer: false, fc: false, alba: false };
const D_MGR = { owner: true, admin: true, manager: true, trainer: false, fc: false, alba: false };
// D_OWNER: 정책상 owner 전용. 그러나 "관리자는 기본적으로 모든 권한 보유" 원칙에 맞춰 admin 도 true.
const D_OWNER = { owner: true, admin: true, manager: false, trainer: false, fc: false, alba: false };
// FC 에게 부여하는 팀장급 회원·판매 권한 (D_MGR + fc)
const D_MGR_FC = { owner: true, admin: true, manager: true, trainer: false, fc: true, alba: false };
// 알바 제외 전 직원(예약·출석·발급 등 강사가 하는 운영 업무 기본값)
const D_STAFF_NO_ALBA = { owner: true, admin: true, manager: true, trainer: true, fc: true, alba: false };

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: "center",
    label: "센터 접근",
    items: [
      { key: "center.access_crm", label: "CRM(관리자 웹) 접속 허용 — 끄면 이 등급은 로그인해도 진입 차단", defaults: D_ALL },
    ],
  },
  {
    key: "members",
    label: "회원 관리",
    items: [
      { key: "members.view",       label: "회원 목록·정보 보기",       defaults: D_ALL },
      { key: "members.app_view_all", label: "센터 전체 회원 보기 — 끄면 담당 회원만 (웹·앱 공통)", defaults: D_ADMIN },
      { key: "members.excel",      label: "회원 목록 엑셀 내보내기",       defaults: D_MGR },
      { key: "members.create",     label: "회원 등록(추가)",             defaults: D_MGR_FC },
      { key: "members.edit_basic", label: "회원 기본정보 수정 — 이름·연락처·메모 등",   defaults: D_MGR_FC },
      { key: "members.edit_usage", label: "회원 이용권·회원권 정보 수정 — 시작일·만료·홀딩 등",   defaults: D_MGR_FC },
      { key: "members.delete",     label: "회원 삭제",             defaults: D_ADMIN },
      { key: "members.mileage",    label: "마일리지 적립·사용",   defaults: D_MGR_FC },
      { key: "members.face",       label: "회원 얼굴사진(생체) 등록·삭제", defaults: D_ADMIN },
      { key: "members.records",    label: "회원 운동기록·체성분 작성·삭제", defaults: D_ALL },
    ],
  },
  {
    key: "sales",
    label: "매출 관리",
    items: [
      { key: "sales.view",         label: "매출 내역 보기",             defaults: D_MGR_FC },
      { key: "sales.edit",         label: "매출(결제) 내역 수정",             defaults: D_ADMIN },
      { key: "sales.refund",       label: "회원권·대여권 환불 처리",   defaults: D_ADMIN },
      { key: "sales.delete",       label: "매출(결제) 내역 삭제",             defaults: D_ADMIN },
      { key: "sales.excel",        label: "매출 내역 엑셀 내보내기",       defaults: D_ADMIN },
      { key: "sales.payroll_view", label: "직원 급여 정책 보기",       defaults: D_ADMIN },
      { key: "sales.commission_edit", label: "강사 수업료·정산(커미션) 설정", defaults: D_ADMIN },
      { key: "stats.view",         label: "통계 화면 보기 — 매출·재무 전체", defaults: D_ADMIN },
    ],
  },
  {
    key: "dashboard",
    label: "대시보드 표시",
    items: [
      { key: "dashboard.view",     label: "대시보드 화면 보기",                       defaults: D_ALL },
      { key: "dashboard.members",  label: "대시보드 회원·출석·수업 지표 보기",           defaults: D_ALL },
      { key: "dashboard.finance",  label: "대시보드 매출·재무 지표 보기 — 강사 매출 랭킹 등", defaults: D_ADMIN },
    ],
  },
  {
    key: "products",
    label: "상품 관리",
    items: [
      { key: "products.view",         label: "상품 목록 보기",             defaults: D_ALL },
      { key: "products.settings_view",label: "상품 유형·설정 보기",       defaults: D_MGR },
      { key: "products.settings_edit",label: "상품 유형·설정 수정",       defaults: D_ADMIN },
      { key: "products.market_edit",  label: "온라인 마켓 판매 설정",  defaults: D_ADMIN },
      { key: "products.create",       label: "상품 만들기(추가)",             defaults: D_ADMIN },
      { key: "products.edit",         label: "상품 수정",             defaults: D_ADMIN },
      { key: "products.delete",       label: "상품 삭제",             defaults: D_ADMIN },
      { key: "products.sell",         label: "상품 판매·회원에게 발급",             defaults: D_MGR_FC },
    ],
  },
  {
    key: "lockers",
    label: "락커 관리",
    items: [
      { key: "lockers.zone_create", label: "락커룸(구역) 추가", defaults: D_ADMIN },
      { key: "lockers.zone_edit",   label: "락커룸(구역) 수정", defaults: D_ADMIN },
      { key: "lockers.zone_delete", label: "락커룸(구역) 삭제", defaults: D_OWNER },
      { key: "lockers.edit",        label: "락커 배정·이동·비밀번호 관리",   defaults: D_MGR_FC },
    ],
  },
  {
    key: "passes",
    label: "수강권 관리",
    items: [
      { key: "passes.issue",  label: "수강권 발급(판매)",                          defaults: D_STAFF_NO_ALBA },
      { key: "passes.edit",   label: "수강권 수정 — 담당강사·세션수·메모 등", defaults: D_ADMIN },
      { key: "passes.refund", label: "수강권 환불 처리",                          defaults: D_ADMIN },
    ],
  },
  {
    key: "schedule",
    label: "스케줄 · 예약 · 출석",
    items: [
      { key: "schedule.reserve", label: "수업 예약 잡기·변경·취소",   defaults: D_STAFF_NO_ALBA },
      { key: "schedule.attend",  label: "수업 출석·노쇼 처리 — 예약된 수업 진행 확정",  defaults: D_STAFF_NO_ALBA },
      { key: "attendance.manage", label: "터치출석 체크인·출석기록 삭제 — 키오스크 입장 처리", defaults: D_STAFF_NO_ALBA },
      {
        key: "schedule.view_others",
        label: "다른 강사 스케줄 보기",
        defaults: D_ADMIN,
      },
      {
        key: "schedule.manage_others",
        label: "다른 강사 수업 관리 — 예약·출석·삭제까지",
        defaults: D_ADMIN,
      },
    ],
  },
  {
    key: "contracts",
    label: "계약서",
    items: [
      { key: "staff_contracts.view", label: "직원(근로) 계약서 보기", defaults: D_ADMIN },
      { key: "staff_contracts.edit", label: "직원(근로) 계약서 작성·수정", defaults: D_OWNER },
      { key: "contracts.member_edit", label: "회원 전자계약서 작성·발송·양식 관리", defaults: D_MGR_FC },
    ],
  },
  {
    key: "messages",
    label: "메세지 전송",
    items: [
      { key: "messages.send", label: "회원에게 문자·알림 직접 보내기", defaults: D_MGR },
      { key: "messages.auto_edit", label: "자동 메세지(자동 발송) 설정 관리", defaults: D_ADMIN },
    ],
  },
  {
    key: "staff",
    label: "직원 · 권한 관리",
    items: [
      { key: "staff.manage", label: "직원 등록·가입 승인·등급 변경", defaults: D_ADMIN },
      { key: "staff.permissions_edit", label: "직급 권한·등급 설정 편집", defaults: D_OWNER },
    ],
  },
  {
    key: "settings",
    label: "센터 설정",
    items: [
      { key: "settings.edit", label: "센터 설정 변경 — 예약·음성·키오스크·사업자정보", defaults: D_ADMIN },
    ],
  },
];

/** 저장된 값을 defaults 와 병합해 (role,perm) → enabled 매트릭스 반환 */
export function buildPermissionMatrix(
  saved: { role_key: string; permission_key: string; enabled: boolean }[]
): Record<string, Record<string, boolean>> {
  const map: Record<string, Record<string, boolean>> = {};
  for (const r of ROLE_COLS) map[r.key] = {};
  // 기본값 채우기
  for (const g of PERMISSION_GROUPS) {
    for (const it of g.items) {
      for (const r of ROLE_COLS) {
        map[r.key][it.key] = it.defaults[r.key] ?? false;
      }
    }
  }
  // 저장된 값으로 덮어쓰기
  for (const row of saved) {
    if (map[row.role_key]) {
      map[row.role_key][row.permission_key] = row.enabled;
    }
  }
  // owner 는 항상 전부 true (안전장치)
  for (const g of PERMISSION_GROUPS) {
    for (const it of g.items) {
      map.owner[it.key] = true;
    }
  }
  return map;
}

export const ALL_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap((g) =>
  g.items.map((i) => i.key)
);

/**
 * 등급의 기본 분류. fc(FC)·alba(아르바이트)는 권한 기본값을 각자 프로필로 갖는다.
 * (역할/접근 게이트는 별도로 강사(trainer) 로 매핑 — staff API 참고)
 */
export type GradeBaseRole = "owner" | "admin" | "manager" | "trainer" | "fc" | "alba";

export interface GradeMeta {
  id: number;
  base_role: GradeBaseRole;
  label: string;
}

/**
 * 등급별 권한 매트릭스: 각 등급의 기본값은 등급의 base_role defaults 를 따르고,
 * crm_grade_permissions 에 저장된 (grade_id, permission_key) override 로 덮어씀.
 * base_role='owner' 등급은 언제나 전부 true.
 */
export function buildGradePermissionMatrix(
  grades: GradeMeta[],
  saved: { grade_id: number; permission_key: string; enabled: boolean }[]
): Record<number, Record<string, boolean>> {
  const map: Record<number, Record<string, boolean>> = {};
  for (const grade of grades) {
    const row: Record<string, boolean> = {};
    for (const g of PERMISSION_GROUPS) {
      for (const it of g.items) {
        row[it.key] =
          grade.base_role === "owner" ? true : it.defaults[grade.base_role] ?? false;
      }
    }
    map[grade.id] = row;
  }
  // 저장된 override 덮어쓰기 (owner 등급은 무시 — 항상 true)
  for (const s of saved) {
    const target = map[s.grade_id];
    if (!target) continue;
    const grade = grades.find((g) => g.id === s.grade_id);
    if (grade?.base_role === "owner") continue;
    target[s.permission_key] = s.enabled;
  }
  return map;
}
