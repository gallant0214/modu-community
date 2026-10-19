/**
 * PT 상담지 템플릿 정의(JSON) 스키마 & 헬퍼.
 *
 * 사용자 정의 커스텀 템플릿은 아래 형식으로 crm_consultation_templates.definition 에 저장.
 * 상담 답변은 crm_pt_consultations.custom_data 에 field.key 로 매핑되어 저장.
 */

export type CustomFieldType =
  | "text"       // 한 줄 텍스트
  | "textarea"   // 여러 줄 텍스트
  | "number"     // 숫자
  | "date"       // 날짜
  | "time"       // 시간(HH:mm)
  | "chips_multi"  // 여러 개 선택
  | "chips_single" // 한 개 선택
  | "toggle";      // on/off (bool)

export interface CustomFieldOption {
  v: string;  // 값
  l: string;  // 라벨
}

export interface CustomField {
  key: string;      // 저장 키 (custom_data 안의 프로퍼티 이름)
  type: CustomFieldType;
  label: string;
  placeholder?: string;
  helper?: string;
  options?: CustomFieldOption[];  // chips_multi/chips_single 에서만 사용
  /** 필수 입력 표시(*) — 저장을 막지는 않고 작성자에게 표시만 한다 */
  required?: boolean;
}

export interface CustomSection {
  key: string;
  title: string;
  fields: CustomField[];
}

/**
 * 기본 양식(표준 섹션) 손질 결과.
 * 🚨 숨김·이름변경·순서만 저장한다. 답변이 들어가는 DB 컬럼은 건드리지 않으므로
 *    예전 상담 기록이 그대로 보인다.
 */
export interface StandardOverrides {
  /** 숨길 섹션 key */
  hidden_sections?: string[];
  /** 숨길 항목 key */
  hidden_fields?: string[];
  /** 섹션 제목 바꾸기 (key → 새 제목) */
  section_titles?: Record<string, string>;
  /** 항목 이름 바꾸기 (key → 새 이름) */
  field_labels?: Record<string, string>;
  /** 섹션 표시 순서 (key 배열) */
  section_order?: string[];
  /** 객관식 버튼 목록 바꾸기 (항목 key → 고친 전체 목록) */
  field_options?: Record<string, CustomFieldOption[]>;
}

export interface TemplateDefinition {
  /** 표준 섹션(기본 상담지) 포함 여부. false 면 최소 정보만 + custom_sections. */
  include_standard?: boolean;
  /** 기본 양식 손질 (숨김·이름·순서) */
  standard_overrides?: StandardOverrides;
  /** 사용자 정의 섹션 목록 (표준 섹션 뒤에 노출) */
  custom_sections?: CustomSection[];
  /** 템플릿 노트 (관리자용, 폼에는 노출 안 됨) */
  note?: string;
}

export function normalizeDefinition(raw: unknown): TemplateDefinition {
  if (!raw || typeof raw !== "object") return { include_standard: true, custom_sections: [] };
  const obj = raw as Partial<TemplateDefinition>;
  return {
    include_standard: obj.include_standard !== false,
    standard_overrides: normalizeOverrides(obj.standard_overrides),
    custom_sections: Array.isArray(obj.custom_sections) ? obj.custom_sections : [],
    note: typeof obj.note === "string" ? obj.note : undefined,
  };
}

export function makeFieldKey(existingKeys: Set<string>, base: string): string {
  const slug =
    (base || "field")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "field";
  if (!existingKeys.has(slug)) return slug;
  let i = 2;
  while (existingKeys.has(`${slug}_${i}`)) i++;
  return `${slug}_${i}`;
}

export function makeSectionKey(existingKeys: Set<string>, base: string): string {
  return makeFieldKey(existingKeys, base || "section");
}

export const FIELD_TYPE_LABEL: Record<CustomFieldType, string> = {
  text: "한 줄 텍스트",
  textarea: "여러 줄 텍스트",
  number: "숫자",
  date: "날짜",
  time: "시간",
  chips_multi: "객관식 버튼 (여러 개 선택)",
  chips_single: "객관식 버튼 (하나만 선택)",
  toggle: "예/아니오 (스위치)",
};

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function strMap(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string" && val.trim()) out[k] = val;
  }
  return out;
}

export function normalizeOverrides(raw: unknown): StandardOverrides {
  const o = (raw ?? {}) as Partial<StandardOverrides>;
  return {
    hidden_sections: strArray(o.hidden_sections),
    hidden_fields: strArray(o.hidden_fields),
    section_titles: strMap(o.section_titles),
    field_labels: strMap(o.field_labels),
    section_order: strArray(o.section_order),
    field_options: optionMap(o.field_options),
  };
}

function optionMap(v: unknown): Record<string, CustomFieldOption[]> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, CustomFieldOption[]> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (!Array.isArray(val)) continue;
    const opts = val
      .filter((o): o is CustomFieldOption =>
        !!o && typeof o === "object" && typeof (o as CustomFieldOption).v === "string"
      )
      .map((o) => ({ v: o.v, l: typeof o.l === "string" && o.l ? o.l : o.v }));
    if (opts.length) out[k] = opts;
  }
  return out;
}
