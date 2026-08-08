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

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: "center",
    label: "센터 접근",
    items: [
      { key: "center.access_crm", label: "센터 CRM 웹 접속 (끄면 이 등급은 진입 차단)", defaults: D_ALL },
    ],
  },
  {
    key: "members",
    label: "회원 관리",
    items: [
      { key: "members.view",       label: "회원 관리 열람",       defaults: D_ALL },
      { key: "members.excel",      label: "회원 엑셀 추출",       defaults: D_MGR },
      { key: "members.create",     label: "회원 추가",             defaults: D_MGR_FC },
      { key: "members.edit_basic", label: "회원 기본정보 수정",   defaults: D_MGR_FC },
      { key: "members.edit_usage", label: "회원 이용정보 수정",   defaults: D_MGR_FC },
      { key: "members.delete",     label: "회원 삭제",             defaults: D_ADMIN },
      { key: "members.mileage",    label: "마일리지 적립/사용",   defaults: D_MGR_FC },
    ],
  },
  {
    key: "sales",
    label: "매출 관리",
    items: [
      { key: "sales.view",         label: "매출 열람",             defaults: D_MGR_FC },
      { key: "sales.edit",         label: "매출 수정",             defaults: D_ADMIN },
      { key: "sales.refund",       label: "회원권·대여권 환불",   defaults: D_ADMIN },
      { key: "sales.delete",       label: "매출 삭제",             defaults: D_ADMIN },
      { key: "sales.excel",        label: "매출 엑셀 추출",       defaults: D_ADMIN },
      { key: "sales.payroll_view", label: "급여 정책 열람",       defaults: D_ADMIN },
      { key: "sales.commission_edit", label: "강사 수업료(정산) 설정", defaults: D_ADMIN },
    ],
  },
  {
    key: "dashboard",
    label: "대시보드 표시",
    items: [
      { key: "dashboard.view",     label: "대시보드 열람",                       defaults: D_ALL },
      { key: "dashboard.members",  label: "회원·출석·수업 통계 열람",           defaults: D_ALL },
      { key: "dashboard.finance",  label: "매출·결제·강사 매출 랭킹 등 재무 열람", defaults: D_ADMIN },
    ],
  },
  {
    key: "products",
    label: "상품 관리",
    items: [
      { key: "products.view",         label: "상품 열람",             defaults: D_ALL },
      { key: "products.settings_view",label: "상품 설정 열람",       defaults: D_MGR },
      { key: "products.settings_edit",label: "상품 설정 수정",       defaults: D_ADMIN },
      { key: "products.market_edit",  label: "상품 마켓 판매 설정",  defaults: D_ADMIN },
      { key: "products.create",       label: "상품 추가",             defaults: D_ADMIN },
      { key: "products.edit",         label: "상품 수정",             defaults: D_ADMIN },
      { key: "products.delete",       label: "상품 삭제",             defaults: D_ADMIN },
      { key: "products.sell",         label: "상품 판매",             defaults: D_MGR_FC },
    ],
  },
  {
    key: "lockers",
    label: "락커 관리",
    items: [
      { key: "lockers.zone_create", label: "락커룸 추가", defaults: D_ADMIN },
      { key: "lockers.zone_edit",   label: "락커룸 수정", defaults: D_ADMIN },
      { key: "lockers.zone_delete", label: "락커룸 삭제", defaults: D_OWNER },
      { key: "lockers.edit",        label: "락커 수정",   defaults: D_MGR_FC },
    ],
  },
  {
    key: "passes",
    label: "수강권 관리",
    items: [
      { key: "passes.edit",   label: "수강권 수정 (담당강사·세션·메모 등)", defaults: D_ADMIN },
      { key: "passes.refund", label: "수강권 환불",                          defaults: D_ADMIN },
    ],
  },
  {
    key: "schedule",
    label: "스케줄 관리",
    items: [
      {
        key: "schedule.view_others",
        label: "타 강사 스케줄 열람",
        defaults: D_ADMIN,
      },
      {
        key: "schedule.manage_others",
        label: "타 강사 스케줄 예약·수정·삭제",
        defaults: D_ADMIN,
      },
    ],
  },
  {
    key: "staff_contracts",
    label: "직원 계약서 (근로·아르바이트)",
    items: [
      { key: "staff_contracts.view", label: "직원 계약서 열람", defaults: D_ADMIN },
      { key: "staff_contracts.edit", label: "직원 계약서 작성·수정", defaults: D_OWNER },
    ],
  },
  {
    key: "messages",
    label: "메세지 전송",
    items: [
      { key: "messages.send", label: "메세지 전송 (회원에게 수동 발송)", defaults: D_MGR },
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
