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
  TemplateDefinition,
  makeFieldKey,
  makeSectionKey,
  normalizeDefinition,
} from "@/app/lib/crm-consultation-template";

interface Template {
  id: number;
  name: string;
  description: string | null;
  is_default: boolean;
  definition: TemplateDefinition;
}

const FIELD_TYPES: { v: CustomFieldType; l: string }[] = [
  { v: "text", l: FIELD_TYPE_LABEL.text },
  { v: "textarea", l: FIELD_TYPE_LABEL.textarea },
  { v: "number", l: FIELD_TYPE_LABEL.number },
  { v: "date", l: FIELD_TYPE_LABEL.date },
  { v: "time", l: FIELD_TYPE_LABEL.time },
  { v: "chips_multi", l: FIELD_TYPE_LABEL.chips_multi },
  { v: "chips_single", l: FIELD_TYPE_LABEL.chips_single },
  { v: "toggle", l: FIELD_TYPE_LABEL.toggle },
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

  const addField = (sIdx: number, base = "field") => {
    setSections((prev) =>
      prev.map((s, i) => {
        if (i !== sIdx) return s;
        const existing = new Set(s.fields.map((f) => f.key));
        const key = makeFieldKey(existing, base);
        const newField: CustomField = {
          key,
          type: "text",
          label: "새 항목",
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
            기본 상담지 위에 원하는 섹션과 항목을 자유롭게 추가하세요.
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
            기본 상담지(운동경험/영양/컨디션 등 8개 섹션)를 포함
          </span>
        </label>
        <p className="text-[11.5px] text-[#A89B80] leading-relaxed">
          체크 시: 스페셜바디 기본 상담지 뒤에 아래 커스텀 섹션이 이어집니다.<br />
          체크 해제: 기본 정보(회원/이름/연락처/담당 강사) 만 유지하고 커스텀 섹션만 노출됩니다.
        </p>
      </section>

      {/* 섹션 편집 */}
      <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[14px] font-bold text-[#2A251D] dark:text-zinc-100">
            커스텀 섹션 · 항목
          </h2>
          <button
            type="button"
            onClick={addSection}
            className="px-3 py-1.5 rounded-lg bg-[#6B7B3A] text-white text-[12.5px] font-semibold hover:bg-[#5a6932]"
          >
            + 섹션 추가
          </button>
        </div>

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
                                    ? f.options ?? []
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
                          <button
                            type="button"
                            onClick={() => removeField(sIdx, fIdx)}
                            className="px-2 py-2 rounded border border-red-200 text-[11.5px] text-red-700 hover:bg-red-50"
                          >
                            삭제
                          </button>
                        </div>

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

                <button
                  type="button"
                  onClick={() => addField(sIdx)}
                  className="w-full px-3 py-2 rounded-lg border border-dashed border-[#6B7B3A]/40 text-[12.5px] font-semibold text-[#6B7B3A] hover:bg-[#F3F7EA]"
                >
                  + 항목 추가
                </button>
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

function OptionEditor({
  options,
  onChange,
}: {
  options: { v: string; l: string }[];
  onChange: (opts: { v: string; l: string }[]) => void;
}) {
  const [text, setText] = useState("");
  const add = () => {
    const parts = text.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const existing = new Set(options.map((o) => o.v));
    const next = [...options];
    for (const p of parts) {
      let slug = p.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "_").replace(/^_+|_+$/g, "");
      if (!slug) slug = `opt_${next.length + 1}`;
      let i = 2;
      let unique = slug;
      while (existing.has(unique)) unique = `${slug}_${i++}`;
      next.push({ v: unique, l: p });
      existing.add(unique);
    }
    onChange(next);
    setText("");
  };
  return (
    <div className="mt-2 pt-2 border-t border-[#E8E0D0]/70">
      <div className="text-[11px] font-semibold text-[#6B5D47] mb-1">선택지</div>
      <div className="flex flex-wrap gap-1 mb-2">
        {options.map((o, i) => (
          <span
            key={o.v}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#F3F7EA] border border-[#DDE8C5] text-[11.5px]"
          >
            {o.l}
            <button
              type="button"
              onClick={() => onChange(options.filter((_, j) => j !== i))}
              className="text-[#8C8270] hover:text-red-700"
            >
              ✕
            </button>
          </span>
        ))}
      </div>
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
          placeholder="쉼표로 여러 개 입력 (예: 상, 중, 하)"
          className="flex-1 h-8 px-2 rounded border border-[#E8E0D0] bg-white text-[12px]"
        />
        <button
          type="button"
          onClick={add}
          className="px-2.5 py-1 rounded border border-[#6B7B3A] text-[12px] text-[#6B7B3A] font-semibold hover:bg-[#F3F7EA]"
        >
          추가
        </button>
      </div>
    </div>
  );
}
