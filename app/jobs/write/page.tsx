"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { REGION_GROUPS, type RegionGroup } from "@/app/lib/region-data";
import { useAuth } from "@/app/components/auth-provider";

const SPORTS = ["축구", "풋살", "농구", "배구", "배드민턴", "테니스", "탁구", "수영", "골프", "야구", "소프트볼",
  "클라이밍", "필라테스", "요가", "헬스/PT", "태권도", "유도", "검도", "복싱", "킥복싱",
  "무에타이", "주짓수", "합기도", "씨름", "핸드볼", "럭비", "아이스하키", "스케이트",
  "스키/스노보드", "사이클", "트라이애슬론", "육상", "체조", "승마", "댄스스포츠", "기타"];

const EMPLOYMENT_TYPES = ["정규직", "계약직", "파트타임", "프리랜서", "인턴", "기타"];
const AUTHOR_ROLES = ["원장", "팀장", "매니저", "담당자", "기타"];
const CONTACT_TYPES = ["전화", "문자", "카카오톡", "이메일", "기타"];

/* 필수 필드 키 목록 */
const REQUIRED_FIELDS = ["title", "sport", "center_name", "contact", "description"] as const;
type RequiredField = typeof REQUIRED_FIELDS[number];

const REQUIRED_LABELS: Record<RequiredField, string> = {
  title: "제목",
  sport: "종목",
  center_name: "센터명",
  contact: "연락처",
  description: "상세 내용",
};

export default function JobWritePage() {
  const router = useRouter();
  const { user, loading, signInWithGoogle, getIdToken, nickname } = useAuth();

  const [form, setForm] = useState({
    title: "", description: "", center_name: "", address: "",
    author_role: AUTHOR_ROLES[0], author_name: "",
    contact_type: CONTACT_TYPES[0], contact: "",
    sport: "", region_name: "", region_code: "",
    employment_type: EMPLOYMENT_TYPES[0], salary: "",
    headcount: "", benefits: "", preferences: "", deadline: "",
  });

  const [showRegionModal, setShowRegionModal] = useState(false);
  const [regionStep, setRegionStep] = useState<"group" | "sub">("group");
  const [selectedGroup, setSelectedGroup] = useState<RegionGroup | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Set<RequiredField>>(new Set());

  /* 각 필수 필드의 ref */
  const fieldRefs: Record<RequiredField, React.RefObject<HTMLElement | null>> = {
    title: useRef<HTMLElement>(null),
    sport: useRef<HTMLElement>(null),
    center_name: useRef<HTMLElement>(null),
    contact: useRef<HTMLElement>(null),
    description: useRef<HTMLElement>(null),
  };

  const set = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // 입력 시 해당 필드 에러 해제
    if (REQUIRED_FIELDS.includes(key as RequiredField)) {
      setFieldErrors((prev) => {
        const next = new Set(prev);
        next.delete(key as RequiredField);
        return next;
      });
    }
  };

  const handleSubmit = async () => {
    if (!user) { setError("로그인이 필요합니다."); return; }

    // 필수값 검증
    const errors = new Set<RequiredField>();
    for (const field of REQUIRED_FIELDS) {
      if (!form[field]?.trim()) {
        errors.add(field);
      }
    }

    if (errors.size > 0) {
      setFieldErrors(errors);
      // 첫 번째 에러 필드로 스크롤
      const firstError = REQUIRED_FIELDS.find((f) => errors.has(f));
      if (firstError && fieldRefs[firstError].current) {
        fieldRefs[firstError].current.scrollIntoView({ behavior: "smooth", block: "center" });
        // input에 포커스
        const input = fieldRefs[firstError].current.querySelector("input, select, textarea");
        if (input) (input as HTMLElement).focus({ preventScroll: true });
      }
      setError(`${REQUIRED_LABELS[firstError!]}을(를) 입력해주세요.`);
      return;
    }

    setFieldErrors(new Set());
    setSubmitting(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          ...form,
          author_name: form.author_name || (nickname || user.displayName || ""),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "등록에 실패했습니다."); return; }
      router.replace(`/jobs/${data.id}`);
    } catch {
      setError("오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center min-h-screen"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
        <p className="text-zinc-500 text-sm text-center">구인 글 작성은 Google 로그인 후 이용 가능합니다.</p>
        <button
          onClick={signInWithGoogle}
          className="flex items-center gap-2 px-5 py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl font-medium text-sm"
        >
          Google로 로그인
        </button>
      </div>
    );
  }

  const hasError = (field: RequiredField) => fieldErrors.has(field);
  const errorBorder = "border-red-400 dark:border-red-500 ring-1 ring-red-400";

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl">
        {/* 헤더 */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-100 dark:border-zinc-800">
          <button onClick={() => router.back()} className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex-1">구인 글쓰기</span>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
          >{submitting ? "등록 중..." : "등록"}</button>
        </div>

        <div className="px-4 py-4 space-y-4">
          {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950 px-3 py-2 rounded-lg">{error}</p>}

          {/* 필수 항목 안내 */}
          <p className="text-xs text-zinc-400"><span className="text-red-500">*</span> 표시는 필수 입력 항목입니다</p>

          {/* 기본 정보 */}
          <Section title="기본 정보">
            <div ref={fieldRefs.title as React.RefObject<HTMLDivElement>}>
              <Field label="제목" required error={hasError("title")}>
                <input type="text" value={form.title} onChange={(e) => set("title", e.target.value)}
                  placeholder="구인 제목을 입력해주세요" className={`${inputCls} ${hasError("title") ? errorBorder : ""}`} />
              </Field>
            </div>
            <div ref={fieldRefs.sport as React.RefObject<HTMLDivElement>}>
              <Field label="종목" required error={hasError("sport")}>
                <select value={form.sport} onChange={(e) => set("sport", e.target.value)}
                  className={`${inputCls} ${hasError("sport") ? errorBorder : ""}`}>
                  <option value="">종목 선택</option>
                  {SPORTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>
            <div ref={fieldRefs.center_name as React.RefObject<HTMLDivElement>}>
              <Field label="센터명" required error={hasError("center_name")}>
                <input type="text" value={form.center_name} onChange={(e) => set("center_name", e.target.value)}
                  placeholder="센터명 또는 기관명" className={`${inputCls} ${hasError("center_name") ? errorBorder : ""}`} />
              </Field>
            </div>
            <Field label="주소">
              <input type="text" value={form.address} onChange={(e) => set("address", e.target.value)}
                placeholder="상세 주소 (선택)" className={inputCls} />
            </Field>
            <Field label="지역">
              <button onClick={() => { setShowRegionModal(true); setRegionStep("group"); setSelectedGroup(null); }}
                className={`${inputCls} text-left ${!form.region_name ? "text-zinc-400" : ""}`}>
                {form.region_name || "지역 선택 (선택)"}
              </button>
            </Field>
          </Section>

          <Section title="채용 조건">
            <Field label="근무형태">
              <select value={form.employment_type} onChange={(e) => set("employment_type", e.target.value)} className={inputCls}>
                {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="급여">
              <input type="text" value={form.salary} onChange={(e) => set("salary", e.target.value)}
                placeholder="예: 월급 300만원 / 협의" className={inputCls} />
            </Field>
            <Field label="모집인원">
              <input type="text" value={form.headcount} onChange={(e) => set("headcount", e.target.value)}
                placeholder="예: 1명" className={inputCls} />
            </Field>
            <Field label="마감일">
              <input type="text" value={form.deadline} onChange={(e) => set("deadline", e.target.value)}
                placeholder="예: 2025-12-31 또는 채용 시 마감" className={inputCls} />
            </Field>
            <Field label="복리후생">
              <input type="text" value={form.benefits} onChange={(e) => set("benefits", e.target.value)}
                placeholder="예: 4대보험, 교통비 지원" className={inputCls} />
            </Field>
            <Field label="우대사항">
              <input type="text" value={form.preferences} onChange={(e) => set("preferences", e.target.value)}
                placeholder="예: 관련 자격증 소지자" className={inputCls} />
            </Field>
          </Section>

          <Section title="연락처">
            <Field label="담당자 역할">
              <select value={form.author_role} onChange={(e) => set("author_role", e.target.value)} className={inputCls}>
                {AUTHOR_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="담당자명">
              <input type="text" value={form.author_name} onChange={(e) => set("author_name", e.target.value)}
                placeholder="담당자 이름" className={inputCls} />
            </Field>
            <Field label="연락 방법">
              <select value={form.contact_type} onChange={(e) => set("contact_type", e.target.value)} className={inputCls}>
                {CONTACT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <div ref={fieldRefs.contact as React.RefObject<HTMLDivElement>}>
              <Field label="연락처" required error={hasError("contact")}>
                <input type="text" value={form.contact} onChange={(e) => set("contact", e.target.value)}
                  placeholder="전화번호, 이메일 등" className={`${inputCls} ${hasError("contact") ? errorBorder : ""}`} />
              </Field>
            </div>
          </Section>

          <div ref={fieldRefs.description as React.RefObject<HTMLDivElement>}>
            <Section title="상세 내용">
              <Field label="채용 상세" required error={hasError("description")}>
                <textarea
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="채용 상세 내용을 입력해주세요"
                  rows={8}
                  className={`${inputCls} resize-none ${hasError("description") ? errorBorder : ""}`}
                />
              </Field>
            </Section>
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl disabled:opacity-50 transition-colors mb-4"
          >{submitting ? "등록 중..." : "구인 글 등록"}</button>
        </div>
      </div>

      {/* 지역 선택 모달 */}
      {showRegionModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowRegionModal(false)} />
          <div className="relative w-full sm:max-w-md bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[70vh] flex flex-col">
            <div className="flex items-center gap-2 px-4 py-3.5 border-b border-zinc-100 dark:border-zinc-800">
              {regionStep === "sub" && (
                <button onClick={() => setRegionStep("group")} className="p-1 -ml-1 text-zinc-500">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100 flex-1">
                {regionStep === "group" ? "광역시/도 선택" : selectedGroup?.name}
              </span>
              <button onClick={() => setShowRegionModal(false)} className="text-zinc-400 hover:text-zinc-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 py-1">
              {regionStep === "group" ? (
                REGION_GROUPS.map((group) => (
                  <button key={group.code}
                    onClick={() => { setSelectedGroup(group); setRegionStep("sub"); }}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 border-b border-zinc-50 dark:border-zinc-800/50 last:border-0">
                    <span>{group.name}</span>
                    <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))
              ) : (
                selectedGroup?.subRegions.map((sub) => (
                  <button key={sub.code}
                    onClick={() => { set("region_code", sub.code); set("region_name", sub.name); setShowRegionModal(false); }}
                    className="w-full text-left px-4 py-3 text-sm text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 border-b border-zinc-50 dark:border-zinc-800/50 last:border-0">
                    {sub.name}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls = "w-full px-3 py-2.5 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">{title}</h3>
      <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-3 space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className={`text-xs mb-1 block ${error ? "text-red-500 font-medium" : "text-zinc-500 dark:text-zinc-400"}`}>
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
        {error && <span className="ml-1 text-[11px] text-red-400">필수 입력</span>}
      </label>
      {children}
    </div>
  );
}
