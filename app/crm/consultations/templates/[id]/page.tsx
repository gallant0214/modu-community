"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { crmInputClass } from "../../../_components/crm-modal";
import {
  CustomField,
  CustomFieldType,
  CustomSection,
  FIELD_TYPE_LABEL,
  StandardOverrides,
  TemplateDefinition,
  makeFieldKey,
  makeSectionKey,
  normalizeDefinition,
  normalizeOverrides,
} from "@/app/lib/crm-consultation-template";
import {
  STANDARD_FIELD_OPTIONS,
  STANDARD_SECTIONS,
  orderedSectionKeys,
} from "@/app/lib/crm-consultation-standard";
import { CONSULTATION_PRESETS, type ConsultationPreset } from "@/app/lib/crm-consultation-presets";

interface Template {
  id: number;
  name: string;
  description: string | null;
  is_default: boolean;
  definition: TemplateDefinition;
}

const FIELD_TYPES: { v: CustomFieldType; l: string }[] = [
  { v: "chips_single", l: FIELD_TYPE_LABEL.chips_single },
  { v: "chips_multi", l: FIELD_TYPE_LABEL.chips_multi },
  { v: "text", l: FIELD_TYPE_LABEL.text },
  { v: "textarea", l: FIELD_TYPE_LABEL.textarea },
  { v: "number", l: FIELD_TYPE_LABEL.number },
  { v: "date", l: FIELD_TYPE_LABEL.date },
  { v: "time", l: FIELD_TYPE_LABEL.time },
  { v: "toggle", l: FIELD_TYPE_LABEL.toggle },
];

/** 객관식으로 바꿨는데 버튼이 하나도 없으면 바로 고칠 수 있게 두 개를 깔아 둔다. */
const SEED_OPTIONS = [
  { v: "opt_1", l: "선택지 1" },
  { v: "opt_2", l: "선택지 2" },
];

export default function TemplateEditorPage() {
  const router = useRouter();
  const params = useParams();
  const tid = Number(params.id);
  const { getIdToken } = useAuth();

  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [includeStandard, setIncludeStandard] = useState(true);
  const [sections, setSections] = useState<CustomSection[]>([]);
  /* 기본 양식 손질(숨김·이름·순서) */
  const [stdOv, setStdOv] = useState<StandardOverrides>({});
  const [presetOpen, setPresetOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch(`/api/crm/consultations/templates/${tid}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      const def = normalizeDefinition(data.template?.definition);
      const tpl: Template = {
        id: data.template.id,
        name: data.template.name,
        description: data.template.description,
        is_default: data.template.is_default,
        definition: def,
      };
      setTemplate(tpl);
      setName(tpl.name);
      setDescription(tpl.description ?? "");
      setIncludeStandard(def.include_standard !== false);
      setStdOv(normalizeOverrides(def.standard_overrides));
      setSections(def.custom_sections ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, tid]);

  useEffect(() => {
    if (tid) load();
  }, [tid, load]);

  const save = async () => {
    if (!name.trim()) return setError("상담지 이름을 입력해 주세요");
    setSaving(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/consultations/templates/${tid}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          definition: {
            include_standard: includeStandard,
            standard_overrides: stdOv,
            custom_sections: sections,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
      router.push("/crm/consultations?tab=manage");
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  const addSection = () => {
    const existing = new Set(sections.map((s) => s.key));
    const key = makeSectionKey(existing, "section");
    setSections((prev) => [...prev, { key, title: "새 섹션", fields: [] }]);
  };

  const updateSection = (idx: number, patch: Partial<CustomSection>) => {
    setSections((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    setSections((prev) => {
      const arr = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return prev;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return arr;
    });
  };

  const removeSection = (idx: number) => {
    if (!window.confirm("이 섹션을 삭제할까요? 저장 시 반영됩니다.")) return;
    setSections((prev) => prev.filter((_, i) => i !== idx));
  };

  const addField = (sIdx: number, base = "field", type: CustomFieldType = "text") => {
    setSections((prev) =>
      prev.map((s, i) => {
        if (i !== sIdx) return s;
        const existing = new Set(s.fields.map((f) => f.key));
        const key = makeFieldKey(existing, base);
        const isChoice = type === "chips_single" || type === "chips_multi";
        const newField: CustomField = {
          key,
          type,
          label: isChoice ? "새 객관식 질문" : "새 질문",
          options: isChoice ? SEED_OPTIONS.map((o) => ({ ...o })) : undefined,
        };
        return { ...s, fields: [...s.fields, newField] };
      })
    );
  };

  const updateField = (sIdx: number, fIdx: number, patch: Partial<CustomField>) => {
    setSections((prev) =>
      prev.map((s, i) => {
        if (i !== sIdx) return s;
        const fields = s.fields.map((f, j) => (j === fIdx ? { ...f, ...patch } : f));
        return { ...s, fields };
      })
    );
  };

  /** 제공된 양식 붙여넣기 — 섹션·항목 key 는 겹치지 않게 새로 만든다 */
  const addPreset = (preset: ConsultationPreset) => {
    setSections((prev) => {
      const secKeys = new Set(prev.map((s) => s.key));
      const added = preset.sections.map((sec) => {
        const key = makeSectionKey(secKeys, sec.key);
        secKeys.add(key);
        const fKeys = new Set<string>();
        return {
          key,
          title: sec.title,
          fields: sec.fields.map((f) => {
            const fk = makeFieldKey(fKeys, f.key);
            fKeys.add(fk);
            return { ...f, key: fk, options: f.options?.map((o) => ({ ...o })) };
          }),
        };
      });
      return [...prev, ...added];
    });
    setPresetOpen(false);
  };

  /** 항목 순서 바꾸기 (네이버 폼처럼 질문을 위아래로 옮긴다) */
  const moveField = (sIdx: number, fIdx: number, dir: -1 | 1) => {
    setSections((prev) =>
      prev.map((s, i) => {
        if (i !== sIdx) return s;
        const arr = [...s.fields];
        const j = fIdx + dir;
        if (j < 0 || j >= arr.length) return s;
        [arr[fIdx], arr[j]] = [arr[j], arr[fIdx]];
        return { ...s, fields: arr };
      })
    );
  };

  /** 항목 복제 — 선택지까지 그대로 복사하고 저장 키만 새로 만든다 */
  const duplicateField = (sIdx: number, fIdx: number) => {
    setSections((prev) =>
      prev.map((s, i) => {
        if (i !== sIdx) return s;
        const src = s.fields[fIdx];
        if (!src) return s;
        const key = makeFieldKey(new Set(s.fields.map((f) => f.key)), src.key);
        const copy: CustomField = {
          ...src,
          key,
          options: src.options ? src.options.map((o) => ({ ...o })) : undefined,
        };
        const arr = [...s.fields];
        arr.splice(fIdx + 1, 0, copy);
        return { ...s, fields: arr };
      })
    );
  };

  const removeField = (sIdx: number, fIdx: number) => {
    setSections((prev) =>
      prev.map((s, i) => {
        if (i !== sIdx) return s;
        return { ...s, fields: s.fields.filter((_, j) => j !== fIdx) };
      })
    );
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-5 md:px-8 pt-6 text-[13px] text-[#8C8270]">
        불러오는 중…
      </div>
    );
  }
  if (!template) {
    return (
      <div className="max-w-4xl mx-auto px-5 md:px-8 pt-6 text-[13px] text-red-700">
        {error || "템플릿을 불러올 수 없습니다."}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 pt-3 pb-16 space-y-4">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
            PT 상담지 편집
          </h1>
          <p className="mt-1 text-[12.5px] text-[#8C8270] dark:text-zinc-500">
            지금 쓰는 상담지를 그대로 불러와 고치고, 필요한 항목을 더 넣을 수 있어요.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/crm/consultations?tab=manage")}
          className="text-[12px] text-[#6B5D47] hover:underline"
        >
          목록으로
        </button>
      </header>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-50 text-[13px] text-red-700">{error}</div>
      )}

      <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5 space-y-3">
        <FieldLabel>상담지 이름</FieldLabel>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={crmInputClass}
          placeholder="예: 다이어트 특화 상담지"
        />
        <FieldLabel>설명</FieldLabel>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={`${crmInputClass} min-h-[60px]`}
          placeholder="어떤 상황에 사용하는 상담지인지 짧게 기록"
        />
        <label className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            checked={includeStandard}
            onChange={(e) => setIncludeStandard(e.target.checked)}
            className="w-4 h-4 accent-[#6B7B3A]"
          />
          <span className="text-[13px] text-[#3A342A] dark:text-zinc-300">
            기본 상담지(운동 경험·영양·컨디션 등 {STANDARD_SECTIONS.length}개 섹션)를 사용
          </span>
        </label>
        <p className="text-[11.5px] text-[#A89B80] leading-relaxed">
          체크 시: 아래 <strong>기본 양식</strong>을 쓰고, 그 뒤에 직접 만든 섹션이 이어집니다.<br />
          체크 해제: 기본 정보(회원·이름·연락처·담당 강사) 만 남기고 직접 만든 섹션만 보입니다.
        </p>
      </section>

      {/* 기본 양식(표준 섹션) 편집 */}
      {includeStandard && (
        <StandardEditor value={stdOv} onChange={setStdOv} />
      )}

      {/* 섹션 편집 */}
      <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[14px] font-bold text-[#2A251D] dark:text-zinc-100">
            커스텀 섹션 · 항목
          </h2>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPresetOpen((v) => !v)}
              className="px-3 py-1.5 rounded-lg border border-[#6B7B3A] text-[#6B7B3A] dark:border-[#A8B87A] dark:text-[#A8B87A] text-[12.5px] font-semibold hover:bg-[#F3F7EA]"
            >
              제공된 양식 가져오기
            </button>
            <button
              type="button"
              onClick={addSection}
              className="px-3 py-1.5 rounded-lg bg-[#6B7B3A] text-white text-[12.5px] font-semibold hover:bg-[#5a6932]"
            >
              + 섹션 추가
            </button>
          </div>
        </div>

        {presetOpen && (
          <div className="rounded-xl border border-[#6B7B3A]/40 bg-[#F3F7EA]/60 dark:bg-emerald-950/20 p-3 space-y-2">
            <p className="text-[12px] text-[#6B5D47] dark:text-zinc-400">
              누르면 질문 묶음이 아래에 그대로 추가돼요. 추가한 뒤 이름·선택지를 자유롭게 고치면 됩니다.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CONSULTATION_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addPreset(p)}
                  className="text-left px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 hover:border-[#6B7B3A]"
                >
                  <div className="text-[13px] font-bold text-[#2A251D] dark:text-zinc-100">{p.name}</div>
                  <div className="text-[11.5px] text-[#8C8270] dark:text-zinc-500 mt-0.5">{p.summary}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {sections.length === 0 ? (
          <p className="text-[12.5px] text-[#A89B80] text-center py-6">
            아직 추가된 섹션이 없어요. [+ 섹션 추가] 를 눌러 시작하세요.
          </p>
        ) : (
          <ul className="space-y-3">
            {sections.map((s, sIdx) => (
              <li
                key={s.key}
                className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <input
                    value={s.title}
                    onChange={(e) => updateSection(sIdx, { title: e.target.value })}
                    className={`${crmInputClass} font-semibold`}
                    placeholder="섹션 제목"
                  />
                  <div className="shrink-0 flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveSection(sIdx, -1)}
                      className="px-2 py-1.5 rounded border border-[#E8E0D0] text-[12px] hover:bg-[#F5F0E5]"
                      title="위로"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSection(sIdx, 1)}
                      className="px-2 py-1.5 rounded border border-[#E8E0D0] text-[12px] hover:bg-[#F5F0E5]"
                      title="아래로"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSection(sIdx)}
                      className="px-2 py-1.5 rounded border border-red-200 text-[12px] text-red-700 hover:bg-red-50"
                    >
                      섹션 삭제
                    </button>
                  </div>
                </div>

                {s.fields.length === 0 ? (
                  <p className="text-[11.5px] text-[#A89B80] pl-1">항목이 없습니다.</p>
                ) : (
                  <ul className="space-y-2">
                    {s.fields.map((f, fIdx) => (
                      <li
                        key={f.key}
                        className="rounded-lg border border-[#E8E0D0]/70 bg-[#FBF7EB]/40 dark:bg-zinc-900/60 dark:border-zinc-800 p-2.5"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-2 items-start">
                          <input
                            value={f.label}
                            onChange={(e) => updateField(sIdx, fIdx, { label: e.target.value })}
                            className={crmInputClass}
                            placeholder="항목 이름"
                          />
                          <select
                            value={f.type}
                            onChange={(e) =>
                              updateField(sIdx, fIdx, {
                                type: e.target.value as CustomFieldType,
                                options:
                                  e.target.value === "chips_multi" ||
                                  e.target.value === "chips_single"
                                    ? f.options?.length
                                      ? f.options
                                      : SEED_OPTIONS.map((o) => ({ ...o }))
                                    : undefined,
                              })
                            }
                            className={crmInputClass}
                          >
                            {FIELD_TYPES.map((t) => (
                              <option key={t.v} value={t.v}>
                                {t.l}
                              </option>
                            ))}
                          </select>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => moveField(sIdx, fIdx, -1)}
                              disabled={fIdx === 0}
                              className="px-2 py-2 rounded border border-[#E8E0D0] dark:border-zinc-700 text-[11.5px] hover:bg-[#F5F0E5] disabled:opacity-30"
                              title="위로"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => moveField(sIdx, fIdx, 1)}
                              disabled={fIdx === s.fields.length - 1}
                              className="px-2 py-2 rounded border border-[#E8E0D0] dark:border-zinc-700 text-[11.5px] hover:bg-[#F5F0E5] disabled:opacity-30"
                              title="아래로"
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              onClick={() => duplicateField(sIdx, fIdx)}
                              className="px-2 py-2 rounded border border-[#E8E0D0] dark:border-zinc-700 text-[11.5px] text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5]"
                              title="이 항목 복제"
                            >
                              복제
                            </button>
                            <button
                              type="button"
                              onClick={() => removeField(sIdx, fIdx)}
                              className="px-2 py-2 rounded border border-red-200 text-[11.5px] text-red-700 hover:bg-red-50"
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                        <label className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-[#6B5D47] dark:text-zinc-400">
                          <input
                            type="checkbox"
                            checked={!!f.required}
                            onChange={(e) => updateField(sIdx, fIdx, { required: e.target.checked })}
                            className="w-3.5 h-3.5 accent-[#6B7B3A]"
                          />
                          필수 항목으로 표시
                        </label>

                        {(f.type === "chips_multi" || f.type === "chips_single") && (
                          <OptionEditor
                            options={f.options ?? []}
                            onChange={(opts) => updateField(sIdx, fIdx, { options: opts })}
                          />
                        )}

                        {(f.type === "text" || f.type === "textarea" || f.type === "number") && (
                          <input
                            value={f.placeholder ?? ""}
                            onChange={(e) => updateField(sIdx, fIdx, { placeholder: e.target.value })}
                            className={`${crmInputClass} mt-2 text-[12.5px]`}
                            placeholder="플레이스홀더 (선택)"
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => addField(sIdx)}
                    className="px-3 py-2 rounded-lg border border-dashed border-[#6B7B3A]/40 text-[12.5px] font-semibold text-[#6B7B3A] dark:text-[#A8B87A] hover:bg-[#F3F7EA]"
                  >
                    + 주관식 질문
                  </button>
                  <button
                    type="button"
                    onClick={() => addField(sIdx, "choice", "chips_single")}
                    className="px-3 py-2 rounded-lg border border-dashed border-[#6B7B3A]/40 text-[12.5px] font-semibold text-[#6B7B3A] dark:text-[#A8B87A] hover:bg-[#F3F7EA]"
                  >
                    + 객관식 버튼 질문
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push("/crm/consultations?tab=manage")}
          className="px-4 py-2 rounded-lg border border-[#E8E0D0] text-[13px] text-[#3A342A] hover:bg-[#F5F0E5]"
        >
          취소
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-5 py-2.5 rounded-lg bg-[#6B7B3A] text-white text-[13.5px] font-semibold hover:bg-[#5a6932] disabled:opacity-60"
        >
          {saving ? "저장 중…" : "상담지 저장"}
        </button>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11.5px] font-semibold text-[#6B5D47] dark:text-zinc-400 mb-1">
      {children}
    </div>
  );
}

function makeOptionValue(label: string, taken: Set<string>): string {
  let slug = label.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "_").replace(/^_+|_+$/g, "");
  if (!slug) slug = "opt";
  let unique = slug;
  let i = 2;
  while (taken.has(unique)) unique = `${slug}_${i++}`;
  return unique;
}

/**
 * 객관식 버튼 편집기 — 상담지에서 누르는 버튼들을 그대로 보여 주고 고치게 한다.
 * 🚨 버튼의 저장값(v)은 한 번 만들면 바꾸지 않는다. 과거 답변이 그 값으로 들어가 있어서,
 *    이름(l)만 고치면 예전 기록도 새 이름으로 보인다.
 */
function OptionEditor({
  options,
  onChange,
  title = "객관식 버튼",
}: {
  options: { v: string; l: string }[];
  onChange: (opts: { v: string; l: string }[]) => void;
  title?: string;
}) {
  const [text, setText] = useState("");

  const add = () => {
    const parts = text.split(",").map((t) => t.trim()).filter(Boolean);
    if (!parts.length) return;
    const taken = new Set(options.map((o) => o.v));
    const next = [...options];
    for (const label of parts) {
      const v = makeOptionValue(label, taken);
      taken.add(v);
      next.push({ v, l: label });
    }
    onChange(next);
    setText("");
  };
  const rename = (i: number, label: string) =>
    onChange(options.map((o, j) => (j === i ? { ...o, l: label } : o)));
  const remove = (i: number) => onChange(options.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= options.length) return;
    const next = [...options];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="mt-2 pt-2 border-t border-[#E8E0D0]/70 dark:border-zinc-800">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[11.5px] font-semibold text-[#6B5D47] dark:text-zinc-400">
          {title}
        </span>
        <span className="text-[11px] text-[#A89B80]">{options.length}개</span>
      </div>
      {options.length === 0 ? (
        <p className="text-[11.5px] text-[#A89B80] mb-2">
          아직 버튼이 없어요. 아래에 이름을 적고 [추가] 를 누르세요.
        </p>
      ) : (
        <ul className="space-y-1 mb-2">
          {options.map((o, i) => (
            <li key={o.v} className="flex items-center gap-1">
              <span className="w-5 shrink-0 text-center text-[11px] text-[#A89B80]">{i + 1}</span>
              <input
                value={o.l}
                onChange={(e) => rename(i, e.target.value)}
                className="flex-1 h-8 px-2 rounded-full border border-[#DDE8C5] dark:border-zinc-700 bg-[#F3F7EA] dark:bg-zinc-900 text-[12.5px] text-[#2A251D] dark:text-zinc-100"
              />
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="px-1.5 py-1 rounded border border-[#E8E0D0] dark:border-zinc-700 text-[11px] hover:bg-[#F5F0E5] disabled:opacity-30"
                title="위로"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === options.length - 1}
                className="px-1.5 py-1 rounded border border-[#E8E0D0] dark:border-zinc-700 text-[11px] hover:bg-[#F5F0E5] disabled:opacity-30"
                title="아래로"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => remove(i)}
                className="px-1.5 py-1 rounded border border-red-200 text-[11px] text-red-700 hover:bg-red-50"
                title="이 버튼 삭제"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-1.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="버튼 이름 (쉼표로 여러 개 — 예: 상, 중, 하)"
          className="flex-1 h-8 px-2 rounded border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] text-[#2A251D] dark:text-zinc-100"
        />
        <button
          type="button"
          onClick={add}
          className="px-2.5 py-1 rounded border border-[#6B7B3A] text-[12px] text-[#6B7B3A] dark:border-[#A8B87A] dark:text-[#A8B87A] font-semibold hover:bg-[#F3F7EA]"
        >
          추가
        </button>
      </div>
    </div>
  );
}

/**
 * 기본 양식(표준 섹션) 편집기.
 *
 * 🚨 여기서 고치는 건 '보이기/숨기기 · 이름 · 순서' 뿐이다. 답변이 저장되는 자리는 그대로라
 *    예전 상담 기록이 깨지지 않는다. 완전히 새로운 질문은 아래 '직접 만든 섹션' 에서 추가한다.
 */
function StandardEditor({
  value,
  onChange,
}: {
  value: StandardOverrides;
  onChange: (next: StandardOverrides) => void;
}) {
  const [open, setOpen] = useState<string>("");
  const [openOpts, setOpenOpts] = useState<string>("");

  const hiddenSections = value.hidden_sections ?? [];
  const hiddenFields = value.hidden_fields ?? [];
  const titles = value.section_titles ?? {};
  const labels = value.field_labels ?? {};
  const fieldOptions = value.field_options ?? {};
  const order = orderedSectionKeys(value.section_order);

  const patch = (p: Partial<StandardOverrides>) => onChange({ ...value, ...p });
  const toggleIn = (list: string[], key: string) =>
    list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
  const setText = (map: Record<string, string>, key: string, text: string) => {
    const next = { ...map };
    if (text.trim()) next[key] = text;
    else delete next[key];
    return next;
  };
  const move = (key: string, dir: -1 | 1) => {
    const arr = [...order];
    const i = arr.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    patch({ section_order: arr });
  };

  const byKey = new Map(STANDARD_SECTIONS.map((s) => [s.key, s]));
  const hiddenCount = hiddenSections.length + hiddenFields.length;

  return (
    <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[14px] font-bold text-[#2A251D] dark:text-zinc-100">
          기본 양식 · 지금 쓰는 상담지
        </h2>
        {(hiddenCount > 0 ||
          (value.section_order ?? []).length > 0 ||
          Object.keys(fieldOptions).length > 0) && (
          <button
            type="button"
            onClick={() =>
              patch({
                hidden_sections: [],
                hidden_fields: [],
                section_titles: {},
                field_labels: {},
                section_order: [],
                field_options: {},
              })
            }
            className="px-3 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12px] text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5]"
          >
            처음 상태로 되돌리기
          </button>
        )}
      </div>
      <p className="text-[11.5px] text-[#A89B80] leading-relaxed">
        체크를 끄면 상담지에서 그 섹션·항목이 사라집니다. 이름 칸을 비워 두면 원래 이름을 씁니다.
        이미 저장된 상담 기록은 그대로 남아요.
      </p>

      <ul className="space-y-2">
        {order.map((skey, idx) => {
          const sec = byKey.get(skey);
          if (!sec) return null;
          const secHidden = hiddenSections.includes(skey);
          const opened = open === skey;
          const hiddenHere = sec.fields.filter((f) => hiddenFields.includes(f.key)).length;
          return (
            <li
              key={skey}
              className={`rounded-xl border p-3 space-y-2 ${
                secHidden
                  ? "border-dashed border-[#E8E0D0] dark:border-zinc-800 bg-[#F5F0E5]/40 dark:bg-zinc-950/40"
                  : "border-[#E8E0D0] dark:border-zinc-800 bg-white dark:bg-zinc-950"
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!secHidden}
                  onChange={() => patch({ hidden_sections: toggleIn(hiddenSections, skey) })}
                  className="w-4 h-4 shrink-0 accent-[#6B7B3A]"
                  title="상담지에 표시"
                />
                <input
                  value={titles[skey] ?? ""}
                  onChange={(e) => patch({ section_titles: setText(titles, skey, e.target.value) })}
                  placeholder={sec.title}
                  className={`${crmInputClass} font-semibold ${secHidden ? "opacity-60" : ""}`}
                />
                <div className="shrink-0 flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(skey, -1)}
                    disabled={idx === 0}
                    className="px-2 py-1.5 rounded border border-[#E8E0D0] dark:border-zinc-700 text-[12px] hover:bg-[#F5F0E5] disabled:opacity-30"
                    title="위로"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(skey, 1)}
                    disabled={idx === order.length - 1}
                    className="px-2 py-1.5 rounded border border-[#E8E0D0] dark:border-zinc-700 text-[12px] hover:bg-[#F5F0E5] disabled:opacity-30"
                    title="아래로"
                  >
                    ↓
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(opened ? "" : skey)}
                className="text-[12px] text-[#6B7B3A] dark:text-[#A8B87A] font-semibold hover:underline"
              >
                {opened ? "항목 접기" : `항목 ${sec.fields.length}개 펼치기`}
                {hiddenHere > 0 && !opened && (
                  <span className="ml-1 text-[#A89B80] font-normal">· {hiddenHere}개 숨김</span>
                )}
              </button>
              {opened && (
                <ul className="pt-1 space-y-1.5 border-t border-[#E8E0D0]/70 dark:border-zinc-800">
                  {sec.fields.length === 0 && (
                    <li className="pt-2 text-[12px] text-[#A89B80]">
                      이 섹션은 입력칸이 하나라 섹션 단위로만 켜고 끌 수 있어요.
                    </li>
                  )}
                  {sec.fields.map((f) => {
                    const fHidden = hiddenFields.includes(f.key);
                    const baseOpts = STANDARD_FIELD_OPTIONS[f.key];
                    const curOpts = fieldOptions[f.key] ?? baseOpts;
                    const optsEdited = !!fieldOptions[f.key];
                    const optsOpen = openOpts === f.key;
                    return (
                      <li key={f.key} className="pt-1.5">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={!fHidden}
                            onChange={() => patch({ hidden_fields: toggleIn(hiddenFields, f.key) })}
                            className="w-4 h-4 shrink-0 accent-[#6B7B3A]"
                            title="상담지에 표시"
                          />
                          <input
                            value={labels[f.key] ?? ""}
                            onChange={(e) =>
                              patch({ field_labels: setText(labels, f.key, e.target.value) })
                            }
                            placeholder={f.label}
                            className={`${crmInputClass} text-[13px] ${fHidden ? "opacity-60" : ""}`}
                          />
                          {baseOpts && (
                            <button
                              type="button"
                              onClick={() => setOpenOpts(optsOpen ? "" : f.key)}
                              className={`shrink-0 px-2.5 py-2 rounded border text-[11.5px] font-semibold ${
                                optsEdited
                                  ? "border-[#6B7B3A] text-[#6B7B3A] bg-[#F3F7EA] dark:bg-emerald-950/30 dark:border-[#A8B87A] dark:text-[#A8B87A]"
                                  : "border-[#E8E0D0] dark:border-zinc-700 text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5]"
                              }`}
                              title="이 문항의 객관식 버튼 편집"
                            >
                              버튼 {curOpts!.length}
                            </button>
                          )}
                        </div>
                        {baseOpts && optsOpen && (
                          <div className="ml-6 mt-1 pl-3 border-l-2 border-[#6B7B3A]/30">
                            <OptionEditor
                              options={[...curOpts!]}
                              onChange={(next) =>
                                patch({ field_options: { ...fieldOptions, [f.key]: next } })
                              }
                              title="이 문항의 객관식 버튼"
                            />
                            {optsEdited && (
                              <button
                                type="button"
                                onClick={() => {
                                  const next = { ...fieldOptions };
                                  delete next[f.key];
                                  patch({ field_options: next });
                                }}
                                className="mt-1.5 text-[11.5px] text-[#6B5D47] dark:text-zinc-400 hover:underline"
                              >
                                이 문항 버튼만 원래대로
                              </button>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
