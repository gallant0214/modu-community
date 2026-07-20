"use client";

import RichEditor from "@/app/components/rich-editor";
import { contractBodyHtml } from "@/app/lib/contract-body";

export interface ContractSection {
  key: string;
  title: string;
  body: string;
  required: boolean;
}

let uidCounter = 0;
export function newSectionKey(): string {
  uidCounter += 1;
  return `s${Date.now().toString(36)}${uidCounter}`;
}

export function ContractSectionsEditor({
  sections,
  onChange,
}: {
  sections: ContractSection[];
  onChange: (next: ContractSection[]) => void;
}) {
  const update = (idx: number, patch: Partial<ContractSection>) => {
    const next = sections.slice();
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  const remove = (idx: number) => {
    onChange(sections.filter((_, i) => i !== idx));
  };
  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const next = sections.slice();
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    onChange(next);
  };
  const moveDown = (idx: number) => {
    if (idx >= sections.length - 1) return;
    const next = sections.slice();
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    onChange(next);
  };
  const addEmpty = () => {
    onChange([
      ...sections,
      { key: newSectionKey(), title: "", body: "", required: true },
    ]);
  };

  return (
    <div className="space-y-3">
      {sections.length === 0 ? (
        <div className="px-4 py-8 text-center text-[12.5px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-lg">
          아직 섹션이 없어요. 아래 버튼으로 섹션을 하나씩 추가해 주세요.
        </div>
      ) : (
        <ul className="space-y-3">
          {sections.map((s, idx) => (
            <li
              key={s.key}
              className="px-3.5 py-3 rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 space-y-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-[#A89B80] dark:text-zinc-500 shrink-0">
                  #{idx + 1}
                </span>
                <input
                  type="text"
                  value={s.title}
                  onChange={(e) => update(idx, { title: e.target.value.slice(0, 60) })}
                  placeholder="섹션 제목 (예: 센터 이용 약관)"
                  className="flex-1 px-2.5 py-1.5 rounded-md border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13.5px] font-semibold text-[#2A251D] dark:text-zinc-100"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    className="w-7 h-7 rounded-md border border-[#E8E0D0] dark:border-zinc-700 text-[#6B5D47] disabled:opacity-30 hover:border-[#6B7B3A]/40"
                    title="위로"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(idx)}
                    disabled={idx === sections.length - 1}
                    className="w-7 h-7 rounded-md border border-[#E8E0D0] dark:border-zinc-700 text-[#6B5D47] disabled:opacity-30 hover:border-[#6B7B3A]/40"
                    title="아래로"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    className="w-7 h-7 rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                    title="섹션 삭제"
                  >
                    ×
                  </button>
                </div>
              </div>

              <RichEditor
                content={contractBodyHtml(s.body)}
                onChange={(html) => update(idx, { body: html })}
                placeholder="이 섹션의 약관 본문을 입력해 주세요."
              />

              {/* 서명 시 실제로 보이는 체크박스 미리보기 */}
              <label className="flex items-center gap-2 px-3 py-2 rounded-md bg-[#FBF7EB]/60 dark:bg-zinc-900/60 border border-[#E8E0D0]/70 dark:border-zinc-800">
                <input
                  type="checkbox"
                  checked={false}
                  readOnly
                  className="w-4 h-4 accent-[#6B7B3A] pointer-events-none"
                />
                <span className="text-[12px] text-[#6B5D47] dark:text-zinc-400 flex-1">
                  <span className="font-medium">
                    ({s.required ? "필수" : "선택"})
                  </span>{" "}
                  위의 약관을 확인하였으며 동의합니다. <span className="text-[#A89B80]">— 미리보기</span>
                </span>
                <button
                  type="button"
                  onClick={() => update(idx, { required: !s.required })}
                  className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border
                    ${s.required
                      ? "border-[#B47B2A] bg-[#F5E4C8]/70 text-[#B47B2A]"
                      : "border-[#E8E0D0] bg-white text-[#6B5D47] dark:bg-zinc-900 dark:text-zinc-400"
                    }`}
                >
                  {s.required ? "필수" : "선택"}
                </button>
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={addEmpty}
          className="px-3 py-1.5 rounded-full text-[12px] font-semibold border border-dashed border-[#6B7B3A] text-[#6B7B3A] dark:text-[#A8B87A] dark:border-[#A8B87A] hover:bg-[#6B7B3A]/5"
        >
          + 새 섹션
        </button>
      </div>

      <p className="text-[11px] text-[#A89B80] leading-relaxed">
        각 섹션마다 실제 전자 계약서에서 별도의 체크박스가 표시됩니다.<br />
        필수/선택 라벨을 클릭해 토글하고 ↑↓ 로 순서를 조정하세요.
      </p>
    </div>
  );
}
