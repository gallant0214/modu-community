"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { REGION_GROUPS, type RegionGroup } from "@/app/lib/region-data";
import { useAuth } from "@/app/components/auth-provider";

/* ══════════════════════════════════
   유틸
   ══════════════════════════════════ */
const CHOSUNG = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
function getChosung(str: string) {
  return [...str].map(ch => {
    const c = ch.charCodeAt(0) - 0xAC00;
    if (c < 0 || c > 11171) return ch;
    return CHOSUNG[Math.floor(c / 588)];
  }).join("");
}
function matchSearch(text: string, q: string) {
  if (!q) return true;
  if (text.toLowerCase().includes(q.toLowerCase())) return true;
  const isCs = [...q].every(c => CHOSUNG.includes(c) || new Set(CHOSUNG).has(c));
  if (isCs) return getChosung(text).includes(getChosung(q));
  return false;
}

function formatPhone(v: string) {
  const n = v.replace(/\D/g, "").slice(0, 11);
  if (n.startsWith("02")) {
    if (n.length <= 2) return n;
    if (n.length <= 5) return `${n.slice(0, 2)}-${n.slice(2)}`;
    if (n.length <= 9) return `${n.slice(0, 2)}-${n.slice(2, 5)}-${n.slice(5)}`;
    return `${n.slice(0, 2)}-${n.slice(2, 6)}-${n.slice(6)}`;
  }
  if (n.length <= 3) return n;
  if (n.length <= 7) return `${n.slice(0, 3)}-${n.slice(3)}`;
  return `${n.slice(0, 3)}-${n.slice(3, 7)}-${n.slice(7)}`;
}

function formatMoney(v: string) {
  const n = v.replace(/\D/g, "");
  if (!n) return "";
  return Number(n).toLocaleString();
}

/* ══════════════════════════════════
   공통 모달
   ══════════════════════════════════ */
function Modal({ open, onClose, icon, title, subtitle, children, footer }: {
  open: boolean; onClose: () => void; icon?: React.ReactNode; title: string; subtitle?: string;
  children: React.ReactNode; footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-[20px] shadow-2xl max-h-[80vh] flex flex-col overflow-hidden">
        <div className="px-5 pt-5 pb-3 text-center shrink-0">
          {icon && <div className="flex justify-center mb-2">{icon}</div>}
          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">{title}</h3>
          {subtitle && <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{subtitle}</p>}
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

/* 라디오 모달 항목 */
function RadioItem({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button onClick={onSelect} className="w-full flex items-center gap-3 px-5 py-3.5 text-left border-b border-zinc-200 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800">
      <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${selected ? "border-blue-500 bg-blue-500 dark:border-blue-500 dark:bg-blue-600" : "border-zinc-200 dark:border-zinc-700"}`}>
        {selected && <span className="w-2 h-2 bg-white rounded-full" />}
      </span>
      <span className="text-sm text-zinc-900 dark:text-zinc-100">{label}</span>
    </button>
  );
}

/* 체크박스 모달 항목 */
function CheckItem({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="w-full flex items-center gap-3 px-5 py-3.5 text-left border-b border-zinc-200 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800">
      <span className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${checked ? "bg-blue-500 dark:bg-blue-600" : "border-2 border-zinc-200 dark:border-zinc-700"}`}>
        {checked && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
      </span>
      <span className="text-sm text-zinc-900 dark:text-zinc-100">{label}</span>
    </button>
  );
}

/* 필드 래퍼 */
function Field({ label, required, children, count, max }: { label: string; required?: boolean; children: React.ReactNode; count?: number; max?: number }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-zinc-500 dark:text-zinc-400 block">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {max !== undefined && count !== undefined && (
        <p className={`text-right text-[11px] ${count > max ? "text-red-500" : "text-zinc-400"}`}>{count}/{max}</p>
      )}
    </div>
  );
}

/* 선택 버튼 (모달 트리거용) */
function SelectButton({ value, placeholder, onClick }: { value: string; placeholder: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between px-3 py-2.5 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 text-left">
      <span className={value ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400"}>{value || placeholder}</span>
      <svg className="w-4 h-4 text-zinc-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );
}

const inputCls = "w-full px-3 py-2.5 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-400";

const EMPLOYMENT_TYPES = ["정규직", "계약직", "아르바이트", "프리랜서(위촉직)", "파트타임", "교육생/연수생", "인턴"];
const SALARY_TYPES = ["시급", "월급", "건당", "협의"];
const HEADCOUNT_OPTIONS = ["1명", "2~3명", "4명 이상", "직접 입력"];
const PREFERENCES_OPTIONS = ["동종업계 경력자", "관련 자격증 소지자", "장기근무 가능자", "초보 가능", "인근 거주자", "대학생 가능", "운전 가능자"];
const BENEFITS_OPTIONS = ["4대보험", "인센티브", "식대지원", "회원권 제공", "교육 지원", "퇴직금"];
const DEADLINE_OPTIONS = ["상시모집", "정원마감시", "직접 입력"];
const AUTHOR_ROLES = ["관리자", "대표", "기타"];

/* ══════════════════════════════════
   메인 페이지
   ══════════════════════════════════ */
export default function JobWritePage() {
  const router = useRouter();
  const { user, loading, signInWithGoogle, getIdToken, nickname } = useAuth();

  /* 카테고리(종목) 서버에서 로드 */
  const [categories, setCategories] = useState<{ id: number; name: string; emoji: string }[]>([]);
  useEffect(() => {
    fetch("/api/categories").then(r => r.json()).then(data => {
      setCategories(Array.isArray(data) ? data.map((c: any) => ({ id: c.id, name: c.name, emoji: c.emoji })) : []);
    }).catch(() => {});
  }, []);

  /* 폼 상태 */
  const [regionCode, setRegionCode] = useState("");
  const [regionName, setRegionName] = useState("");
  const [sport, setSport] = useState("");
  const [centerName, setCenterName] = useState("");
  const [address, setAddress] = useState("");
  const [authorRole, setAuthorRole] = useState("관리자");
  const [authorName, setAuthorName] = useState("");
  const [contact, setContact] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadlineType, setDeadlineType] = useState("");
  const [deadlineDate, setDeadlineDate] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [salaryType, setSalaryType] = useState("");
  const [salaryAmount, setSalaryAmount] = useState("");
  const [salaryIncentive, setSalaryIncentive] = useState(false);
  const [salaryQuickPay, setSalaryQuickPay] = useState(false);
  const [headcount, setHeadcount] = useState("");
  const [headcountCustom, setHeadcountCustom] = useState("");
  const [preferences, setPreferences] = useState<string[]>([]);
  const [benefits, setBenefits] = useState<string[]>([]);
  const [agreed, setAgreed] = useState(false);

  /* 모달 상태 */
  const [showRegion, setShowRegion] = useState(false);
  const [showSport, setShowSport] = useState(false);
  const [showDeadline, setShowDeadline] = useState(false);
  const [showEmployment, setShowEmployment] = useState(false);
  const [showSalary, setShowSalary] = useState(false);
  const [showHeadcount, setShowHeadcount] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [showBenefits, setShowBenefits] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);

  const [regionStep, setRegionStep] = useState<"group" | "sub">("group");
  const [selectedGroup, setSelectedGroup] = useState<RegionGroup | null>(null);
  const [sportSearch, setSportSearch] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  /* refs for scroll */
  const fieldRefs: Record<string, React.RefObject<HTMLDivElement | null>> = {
    region: useRef(null), sport: useRef(null), centerName: useRef(null),
    address: useRef(null), authorName: useRef(null), contact: useRef(null),
    title: useRef(null), description: useRef(null), deadline: useRef(null),
    employment: useRef(null), salary: useRef(null), headcount: useRef(null),
  };

  /* 지역 선택 시 주소 프리필 */
  const handleRegionSelect = (code: string, name: string) => {
    setRegionCode(code);
    setRegionName(name);
    if (!address || REGION_GROUPS.some(g => g.subRegions.some(s => address.startsWith(s.name)))) {
      setAddress(name + " ");
    }
    setShowRegion(false);
  };

  /* 급여 표시 텍스트 */
  const salaryDisplay = (() => {
    if (!salaryType) return "";
    if (salaryType === "협의") return "급여 협의";
    if (!salaryAmount) return salaryType;
    let s = `${salaryType} ${salaryAmount}원`;
    const extras: string[] = [];
    if (salaryIncentive) extras.push("인센티브 있음");
    if (salaryQuickPay) extras.push("주급/당일지급 가능");
    if (extras.length) s += ` (${extras.join(", ")})`;
    return s;
  })();

  /* 마감일 표시 텍스트 */
  const deadlineDisplay = deadlineType === "직접 입력" && deadlineDate
    ? `${deadlineDate}까지`
    : deadlineType;

  /* 모집인원 표시 텍스트 */
  const headcountDisplay = headcount === "직접 입력" ? headcountCustom : headcount;

  /* 유효성 검사 */
  const validate = () => {
    if (!user) { alert("구인 등록은 로그인 후 가능합니다."); return false; }
    const checks: [boolean, string, string][] = [
      [!regionCode, "region", "지역"],
      [!sport, "sport", "종목"],
      [!centerName.trim(), "centerName", "업체명"],
      [!address.trim(), "address", "업체 주소"],
      [!authorName.trim(), "authorName", "작성자 실명"],
      [!contact.trim(), "contact", "연락처"],
      [!title.trim(), "title", "제목"],
      [!description.trim(), "description", "내용"],
      [!deadlineType, "deadline", "모집기간"],
      [!employmentType, "employment", "근무형태"],
      [!salaryType, "salary", "급여"],
      [!headcount || (headcount === "직접 입력" && !headcountCustom.trim()), "headcount", "모집 인원"],
    ];
    for (const [fail, key, label] of checks) {
      if (fail) {
        fieldRefs[key]?.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        alert(`필수 항목을 모두 입력해주세요.\n\n"${label}"을(를) 입력해주세요.`);
        return false;
      }
    }
    if (!agreed) { alert("동의 항목을 체크해주세요."); return false; }
    return true;
  };

  /* 등록 */
  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const token = await getIdToken();
      const salaryText = salaryDisplay;
      const deadlineText = deadlineDisplay;
      const headcountText = headcountDisplay;

      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          center_name: centerName.trim(),
          address: address.trim(),
          author_role: authorRole,
          author_name: authorName.trim() || (nickname || user?.displayName || ""),
          contact_type: "전화",
          contact: contact,
          sport,
          region_name: regionName,
          region_code: regionCode,
          employment_type: employmentType,
          salary: salaryText,
          headcount: headcountText,
          benefits: benefits.join(", "),
          preferences: preferences.join(", "),
          deadline: deadlineText,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "등록에 실패했습니다."); return; }
      router.replace(`/jobs/${data.id}`);
    } catch {
      setError("오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex justify-center items-center min-h-screen"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  if (!user) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
      <p className="text-zinc-400 text-sm text-center">구인 글 작성은 Google 로그인 후 이용 가능합니다.</p>
      <button onClick={signInWithGoogle} className="flex items-center gap-2.5 px-6 py-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded-xl text-sm font-medium text-zinc-700 dark:text-zinc-200 shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"><svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>Google 계정으로 로그인</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 pb-24">
      <div className="mx-auto max-w-2xl">
        {/* 헤더 */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-200 dark:border-zinc-800 sticky top-14 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md z-20">
          <button onClick={() => router.back()} className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex-1">구인 글쓰기</span>
        </div>

        <div className="px-4 py-4 space-y-4">
          {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950 px-3 py-2 rounded-lg">{error}</p>}
          <p className="text-xs text-zinc-400"><span className="text-red-500">*</span> 표시는 필수 입력 항목입니다</p>

          {/* 1. 지역 */}
          <div ref={fieldRefs.region}>
            <Field label="지역" required>
              <div className="flex items-center gap-2">
                <span className={`flex-1 text-sm ${regionName ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400"}`}>
                  {regionName || "지역을 선택해 주세요"}
                </span>
                <button onClick={() => { setShowRegion(true); setRegionStep("group"); }} className="px-3 py-1.5 text-xs border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950 shrink-0">
                  {regionName ? "지역 변경" : "지역 선택"}
                </button>
              </div>
            </Field>
          </div>

          {/* 2. 종목 */}
          <div ref={fieldRefs.sport}>
            <Field label="종목" required>
              <SelectButton value={sport} placeholder="종목을 선택해 주세요" onClick={() => { setShowSport(true); setSportSearch(""); }} />
            </Field>
          </div>

          {/* 3. 업체명 */}
          <div ref={fieldRefs.centerName}>
            <Field label="업체명" required count={centerName.length} max={30}>
              <input type="text" value={centerName} onChange={e => setCenterName(e.target.value.slice(0, 30))} placeholder="센터명 또는 기관명" className={inputCls} />
            </Field>
          </div>

          {/* 4. 업체 주소 */}
          <div ref={fieldRefs.address}>
            <Field label="업체 주소" required>
              <input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="예 : 중구 세종대로 110" className={inputCls} />
            </Field>
          </div>

          {/* 5. 작성자 */}
          <div ref={fieldRefs.authorName}>
            <Field label="작성자 정보" required>
              <div className="flex items-center gap-2">
                <div className="flex gap-1 shrink-0">
                  {AUTHOR_ROLES.map(r => (
                    <button key={r} onClick={() => setAuthorRole(r)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${authorRole === r ? "bg-blue-500 text-white" : "bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400"}`}>
                      {r}
                    </button>
                  ))}
                </div>
                <input type="text" value={authorName} onChange={e => setAuthorName(e.target.value)} placeholder="실명 입력" className={`${inputCls} flex-1`} />
              </div>
            </Field>
          </div>

          {/* 6. 연락처 */}
          <div ref={fieldRefs.contact}>
            <Field label="연락처" required>
              <input type="tel" value={contact} onChange={e => setContact(formatPhone(e.target.value))} placeholder="전화번호 입력" maxLength={13} className={inputCls} />
            </Field>
          </div>

          {/* 7. 제목 */}
          <div ref={fieldRefs.title}>
            <Field label="제목" required count={title.length} max={50}>
              <input type="text" value={title} onChange={e => setTitle(e.target.value.slice(0, 50))} placeholder="예) 강남구 프리랜서 트레이너 정규직 채용" className={inputCls} />
            </Field>
          </div>

          {/* 8. 내용 */}
          <div ref={fieldRefs.description}>
            <Field label="내용" required count={description.length} max={1000}>
              <textarea value={description} onChange={e => setDescription(e.target.value.slice(0, 1000))}
                placeholder="업무 내용, 우대 조건, 근무 분위기 등을 자유롭게 작성하세요."
                rows={6} style={{ minHeight: 150 }} className={`${inputCls} resize-none`} />
            </Field>
          </div>

          {/* 9. 모집기간 */}
          <div ref={fieldRefs.deadline}>
            <Field label="모집기간" required>
              <SelectButton value={deadlineDisplay} placeholder="모집기간을 선택해 주세요" onClick={() => setShowDeadline(true)} />
            </Field>
          </div>

          {/* 10. 근무형태 */}
          <div ref={fieldRefs.employment}>
            <Field label="근무형태" required>
              <SelectButton value={employmentType} placeholder="근무형태를 선택해 주세요" onClick={() => setShowEmployment(true)} />
            </Field>
          </div>

          {/* 11. 급여 */}
          <div ref={fieldRefs.salary}>
            <Field label="급여" required>
              <SelectButton value={salaryDisplay} placeholder="급여를 선택해 주세요" onClick={() => setShowSalary(true)} />
            </Field>
          </div>

          {/* 12. 모집 인원 */}
          <div ref={fieldRefs.headcount}>
            <Field label="모집 인원" required>
              <SelectButton value={headcountDisplay} placeholder="모집 인원을 선택해 주세요" onClick={() => setShowHeadcount(true)} />
            </Field>
          </div>

          {/* 13. 우대 조건 (선택) */}
          <Field label="우대 조건">
            <SelectButton value={preferences.length ? preferences.join(", ") : ""} placeholder="선택 (선택사항)" onClick={() => setShowPreferences(true)} />
          </Field>

          {/* 14. 복리후생 (선택) */}
          <Field label="복리후생">
            <SelectButton value={benefits.length ? benefits.join(", ") : ""} placeholder="선택 (선택사항)" onClick={() => setShowBenefits(true)} />
          </Field>

          {/* 15. 동의 */}
          <div className="pt-2">
            <button onClick={() => setAgreed(!agreed)} className="flex items-start gap-2.5 text-left">
              <span className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center shrink-0 ${agreed ? "bg-blue-500" : "border-2 border-zinc-200 dark:border-zinc-700"}`}>
                {agreed && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                작성한 구인 정보는 사실이며, 허위/불법 내용에 대한 책임은 작성자 본인에게 있습니다. 모두의 지도사는 채용 및 고용 계약에 관여하지 않습니다.
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 하단 고정 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 px-4 py-3 z-20" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}>
        <div className="mx-auto max-w-2xl">
          <button onClick={() => { if (validate()) { setShowConfirm(true); setConfirmChecked(false); } }} disabled={submitting}
            className="w-full py-3.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl disabled:opacity-50 transition-colors">
            구인 등록하기
          </button>
        </div>
      </div>

      {/* ══════ 모달들 ══════ */}

      {/* 지역 선택 모달 */}
      <Modal open={showRegion} onClose={() => setShowRegion(false)} title={regionStep === "group" ? "지역 선택" : selectedGroup?.name || ""} subtitle="광역시/도를 선택한 후 세부 지역을 선택하세요">
        {regionStep === "group" ? (
          <div>{REGION_GROUPS.map(g => (
            <button key={g.code} onClick={() => { setSelectedGroup(g); setRegionStep("sub"); }}
              className="w-full flex items-center justify-between px-5 py-3.5 text-sm text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-800 last:border-0">
              <span>{g.name}</span>
              <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          ))}</div>
        ) : (
          <div>
            <button onClick={() => setRegionStep("group")} className="w-full flex items-center gap-1 px-5 py-2.5 text-sm text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-800">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>뒤로
            </button>
            {selectedGroup?.subRegions.map(s => (
              <button key={s.code} onClick={() => handleRegionSelect(s.code, s.name)}
                className={`w-full text-left px-5 py-3.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-800 last:border-0 ${regionCode === s.code ? "text-blue-600 font-medium" : "text-zinc-900 dark:text-zinc-100"}`}>
                {s.name}
              </button>
            ))}
          </div>
        )}
      </Modal>

      {/* 종목 선택 모달 */}
      <Modal open={showSport} onClose={() => setShowSport(false)} title="종목 선택" subtitle="카테고리를 검색하거나 선택하세요">
        <div className="px-4 py-2 sticky top-0 bg-white dark:bg-zinc-900 z-10">
          <input type="text" value={sportSearch} onChange={e => setSportSearch(e.target.value)} placeholder="종목 검색 (초성 가능)"
            className="w-full px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </div>
        <div>
          {categories.filter(c => matchSearch(c.name, sportSearch)).map(c => (
            <RadioItem key={c.id} label={`${c.emoji} ${c.name}`} selected={sport === c.name}
              onSelect={() => { setSport(c.name); setShowSport(false); }} />
          ))}
          {categories.filter(c => matchSearch(c.name, sportSearch)).length === 0 && (
            <p className="text-center text-sm text-zinc-400 py-8">일치하는 종목이 없습니다</p>
          )}
        </div>
      </Modal>

      {/* 모집기간 모달 */}
      <Modal open={showDeadline} onClose={() => setShowDeadline(false)} title="모집기간 선택">
        <div>
          {DEADLINE_OPTIONS.map(o => (
            <RadioItem key={o} label={o} selected={deadlineType === o} onSelect={() => {
              setDeadlineType(o);
              if (o !== "직접 입력") { setDeadlineDate(""); setShowDeadline(false); }
            }} />
          ))}
          {deadlineType === "직접 입력" && (
            <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800">
              <input type="date" value={deadlineDate} onChange={e => setDeadlineDate(e.target.value)}
                className={inputCls} />
              <button onClick={() => { if (deadlineDate) setShowDeadline(false); }}
                className="w-full mt-2 py-2.5 bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50" disabled={!deadlineDate}>확인</button>
            </div>
          )}
        </div>
      </Modal>

      {/* 근무형태 모달 */}
      <Modal open={showEmployment} onClose={() => setShowEmployment(false)} title="근무형태 선택">
        <div>{EMPLOYMENT_TYPES.map(t => (
          <RadioItem key={t} label={t} selected={employmentType === t} onSelect={() => { setEmploymentType(t); setShowEmployment(false); }} />
        ))}</div>
      </Modal>

      {/* 급여 모달 */}
      <Modal open={showSalary} onClose={() => setShowSalary(false)} title="급여 선택">
        <div>
          {SALARY_TYPES.map(t => (
            <RadioItem key={t} label={t} selected={salaryType === t} onSelect={() => {
              setSalaryType(t);
              if (t === "협의") { setSalaryAmount(""); setSalaryIncentive(false); setSalaryQuickPay(false); setShowSalary(false); }
            }} />
          ))}
          {salaryType && salaryType !== "협의" && (
            <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
              <div className="flex items-center gap-2">
                <input type="text" value={salaryAmount} onChange={e => setSalaryAmount(formatMoney(e.target.value))}
                  placeholder="금액 입력" className={`${inputCls} flex-1`} inputMode="numeric" />
                <span className="text-sm text-zinc-400 shrink-0">원</span>
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <input type="checkbox" checked={salaryIncentive} onChange={e => setSalaryIncentive(e.target.checked)} className="w-4 h-4 rounded accent-blue-600" />
                인센티브 있음
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <input type="checkbox" checked={salaryQuickPay} onChange={e => setSalaryQuickPay(e.target.checked)} className="w-4 h-4 rounded accent-blue-600" />
                주급/당일지급 가능
              </label>
              <button onClick={() => { if (salaryAmount) setShowSalary(false); }} disabled={!salaryAmount}
                className="w-full py-2.5 bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50">확인</button>
            </div>
          )}
        </div>
      </Modal>

      {/* 모집 인원 모달 */}
      <Modal open={showHeadcount} onClose={() => setShowHeadcount(false)} title="모집 인원 선택">
        <div>
          {HEADCOUNT_OPTIONS.map(o => (
            <RadioItem key={o} label={o} selected={headcount === o} onSelect={() => {
              setHeadcount(o);
              if (o !== "직접 입력") { setHeadcountCustom(""); setShowHeadcount(false); }
            }} />
          ))}
          {headcount === "직접 입력" && (
            <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800">
              <input type="text" value={headcountCustom} onChange={e => setHeadcountCustom(e.target.value)} placeholder="예: 5명" className={inputCls} />
              <button onClick={() => { if (headcountCustom.trim()) setShowHeadcount(false); }} disabled={!headcountCustom.trim()}
                className="w-full mt-2 py-2.5 bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50">확인</button>
            </div>
          )}
        </div>
      </Modal>

      {/* 우대 조건 모달 */}
      <Modal open={showPreferences} onClose={() => setShowPreferences(false)} title="우대 조건"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setShowPreferences(false)} className="flex-1 py-2.5 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-500 dark:text-zinc-400">취소</button>
            <button onClick={() => setShowPreferences(false)} className="flex-1 py-2.5 bg-blue-500 text-white rounded-lg text-sm font-medium">확인</button>
          </div>
        }>
        <div>{PREFERENCES_OPTIONS.map(o => (
          <CheckItem key={o} label={o} checked={preferences.includes(o)} onToggle={() => setPreferences(prev => prev.includes(o) ? prev.filter(x => x !== o) : [...prev, o])} />
        ))}</div>
      </Modal>

      {/* 복리후생 모달 */}
      <Modal open={showBenefits} onClose={() => setShowBenefits(false)} title="복리후생"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setShowBenefits(false)} className="flex-1 py-2.5 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-500 dark:text-zinc-400">취소</button>
            <button onClick={() => setShowBenefits(false)} className="flex-1 py-2.5 bg-blue-500 text-white rounded-lg text-sm font-medium">확인</button>
          </div>
        }>
        <div>{BENEFITS_OPTIONS.map(o => (
          <CheckItem key={o} label={o} checked={benefits.includes(o)} onToggle={() => setBenefits(prev => prev.includes(o) ? prev.filter(x => x !== o) : [...prev, o])} />
        ))}</div>
      </Modal>

      {/* 등록 전 확인 모달 */}
      <Modal open={showConfirm} onClose={() => setShowConfirm(false)}
        icon={<svg className="w-9 h-9 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
        title="등록 전 확인"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setShowConfirm(false)} className="flex-1 py-2.5 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-500 dark:text-zinc-400">취소</button>
            <button onClick={() => { setShowConfirm(false); handleSubmit(); }} disabled={!confirmChecked || submitting}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${confirmChecked ? "bg-blue-500 text-white hover:bg-blue-600" : "bg-zinc-200 text-zinc-400 dark:bg-zinc-700 dark:text-zinc-400 cursor-not-allowed"}`}>
              {submitting ? "등록 중..." : "최종 등록하기"}
            </button>
          </div>
        }>
        <div className="px-5 py-3 space-y-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
            허위 구인 또는 실제 근무조건과 다른 내용 기재 시 게시글 삭제, 계정 정지 등의 조치가 이루어질 수 있습니다.
          </p>
          <p className="text-xs text-zinc-400">공고 내용에 대한 책임은 작성자에게 있습니다.</p>
          <button onClick={() => setConfirmChecked(!confirmChecked)} className="flex items-center gap-2.5 pt-2">
            <span className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${confirmChecked ? "bg-blue-500" : "border-2 border-zinc-200 dark:border-zinc-700"}`}>
              {confirmChecked && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
            </span>
            <span className="text-sm text-zinc-600 dark:text-zinc-400">위 내용을 확인했으며 동의합니다.</span>
          </button>
        </div>
      </Modal>
    </div>
  );
}
