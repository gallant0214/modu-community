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
}

export interface CustomSection {
  key: string;
  title: string;
  fields: CustomField[];
}

export interface TemplateDefinition {
  /** 표준 섹션(기본 상담지) 포함 여부. false 면 최소 정보만 + custom_sections. */
  include_standard?: boolean;
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
  chips_multi: "다중 선택 칩",
  chips_single: "단일 선택 칩",
  toggle: "예/아니오 (스위치)",
};
