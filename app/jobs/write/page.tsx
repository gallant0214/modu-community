"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
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

/* 복제용 파서 */
function parseSalary(salary: string) {
  if (!salary) return { salaryType: "", salaryAmount: "", salaryIncentive: false, salaryQuickPay: false };
  const trimmed = salary.trim();
  if (trimmed === "급여 협의" || trimmed === "협의") {
    return { salaryType: "협의", salaryAmount: "", salaryIncentive: false, salaryQuickPay: false };
  }
  const m = trimmed.match(/^(시급|월급|건당)(?:\s+([\d,]+)\s*원)?\s*(?:\(([^)]*)\))?$/);
  if (m) {
    const [, type, amount = "", extras = ""] = m;
    return {
      salaryType: type,
      salaryAmount: amount,
      salaryIncentive: extras.includes("인센티브"),
      salaryQuickPay: extras.includes("주급") || extras.includes("당일지급"),
    };
  }
  return { salaryType: "", salaryAmount: "", salaryIncentive: false, salaryQuickPay: false };
}
function parseDeadline(deadline: string) {
  if (!deadline) return { deadlineType: "", deadlineDate: "" };
  const t = deadline.trim();
  if (t === "상시모집" || t === "정원마감시") return { deadlineType: t, deadlineDate: "" };
  const m = t.match(/^(\d{4}-\d{2}-\d{2})까지$/);
  if (m) return { deadlineType: "직접 입력", deadlineDate: m[1] };
  return { deadlineType: "", deadlineDate: "" };
}
function parseHeadcount(headcount: string) {
  if (!headcount) return { headcount: "", headcountCustom: "" };
  if (["1명", "2~3명", "4명 이상"].includes(headcount)) return { headcount, headcountCustom: "" };
  return { headcount: "직접 입력", headcountCustom: headcount };
}
function parseList(csv: string): string[] {
  if (!csv) return [];
  return csv.split(",").map(s => s.trim()).filter(Boolean);
}

/* ══════════════════════════════════
   프리젠테이셔널 헬퍼
   ══════════════════════════════════ */

/* 공통 모달 */
function Modal({ open, onClose, icon, title, subtitle, children, footer }: {
  open: boolean; onClose: () => void; icon?: React.ReactNode; title: string; subtitle?: string;
  children: React.ReactNode; footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-[#2A251D]/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-[#FEFCF7] dark:bg-zinc-900 rounded-3xl shadow-2xl max-h-[80vh] flex flex-col overflow-hidden border border-[#E8E0D0] dark:border-zinc-700">
        <div className="px-5 pt-6 pb-4 text-center shrink-0">
          {icon && <div className="flex justify-center mb-3">{icon}</div>}
          <h3 className="text-base font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight">{title}</h3>
          {subtitle && <p className="text-[12px] text-[#8C8270] dark:text-zinc-500 mt-1.5">{subtitle}</p>}
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3.5 border-t border-[#E8E0D0]/70 dark:border-zinc-800 shrink-0 bg-[#FBF7EB]/50 dark:bg-transparent">{footer}</div>}
      </div>
    </div>
  );
}

/* 라디오 모달 항목 */
function RadioItem({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button onClick={onSelect} className={`w-full flex items-center gap-3 px-5 py-4 text-left border-b border-[#E8E0D0]/60 dark:border-zinc-800 last:border-0 transition-colors ${
      selected ? "bg-[#F5F0E5] dark:bg-zinc-800/60" : "hover:bg-[#F5F0E5]/60 dark:hover:bg-zinc-800"
    }`}>
      <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
        selected ? "bg-[#6B7B3A] shadow-[0_2px_8px_-2px_rgba(107,123,58,0.4)]" : "border-2 border-[#E8E0D0] dark:border-zinc-700"
      }`}>
        {selected && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
      </span>
      <span className={`text-[14px] ${selected ? "text-[#2A251D] dark:text-zinc-100 font-semibold" : "text-[#3A342A] dark:text-zinc-100"}`}>{label}</span>
    </button>
  );
}

/* 체크박스 모달 항목 */
function CheckItem({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className={`w-full flex items-center gap-3 px-5 py-4 text-left border-b border-[#E8E0D0]/60 dark:border-zinc-800 last:border-0 transition-colors ${
      checked ? "bg-[#F5F0E5] dark:bg-zinc-800/60" : "hover:bg-[#F5F0E5]/60 dark:hover:bg-zinc-800"
    }`}>
      <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
        checked ? "bg-[#6B7B3A] shadow-[0_2px_8px_-2px_rgba(107,123,58,0.4)]" : "border-2 border-[#E8E0D0] dark:border-zinc-700"
      }`}>
        {checked && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
      </span>
      <span className={`text-[14px] ${checked ? "text-[#2A251D] dark:text-zinc-100 font-semibold" : "text-[#3A342A] dark:text-zinc-100"}`}>{label}</span>
    </button>
  );
}

/* 섹션 카드 */
function Section({ number, title, subtitle, children }: { number: number; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-5 sm:p-6 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      <div className="flex items-start gap-3 mb-5">
        <span className="shrink-0 w-7 h-7 rounded-full bg-[#F5F0E5] dark:bg-zinc-800 text-[#6B7B3A] dark:text-[#A8B87A] text-[12px] font-bold flex items-center justify-center">
          {number.toString().padStart(2, "0")}
        </span>
        <div className="flex-1 min-w-0 pt-0.5">
          <h2 className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight">{title}</h2>
          {subtitle && <p className="text-[12px] text-[#8C8270] dark:text-zinc-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

/* 필드 래퍼 */
function Field({ label, required, children, count, max, hint }: { label: string; required?: boolean; children: React.ReactNode; count?: number; max?: number; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-400 tracking-wide">
          {label}{required && <span className="text-[#C0392B] ml-0.5">*</span>}
        </label>
        {hint && <span className="text-[11px] text-[#A89B80]">{hint}</span>}
      </div>
      {children}
      {max !== undefined && count !== undefined && (
        <p className={`text-right text-[11px] ${count > max ? "text-[#C0392B]" : "text-[#A89B80]"}`}>{count}/{max}</p>
      )}
    </div>
  );
}

/* 선택 버튼 (모달 트리거용) */
function SelectButton({ value, placeholder, onClick }: { value: string; placeholder: string; onClick: () => void }) {
  const hasValue = !!value;
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-4 py-3 border rounded-xl text-[14px] text-left transition-colors ${
        hasValue
          ? "border-[#6B7B3A]/40 bg-[#FBF7EB] dark:bg-zinc-800 text-[#2A251D] dark:text-zinc-100 font-medium"
          : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB] dark:bg-zinc-800 text-[#A89B80]"
      } hover:border-[#6B7B3A]/50`}
    >
      <span className="truncate">{value || placeholder}</span>
      <svg className="w-4 h-4 text-[#A89B80] shrink-0 ml-2" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );
}

const inputCls = "w-full px-4 py-3 border border-[#E8E0D0] dark:border-zinc-700 rounded-xl text-[14px] bg-[#FBF7EB] dark:bg-zinc-800 text-[#2A251D] dark:text-zinc-100 placeholder-[#A89B80] focus:outline-none focus:border-[#6B7B3A]/50 focus:bg-[#FEFCF7] dark:focus:bg-zinc-900 transition-colors";

const EMPLOYMENT_TYPES = ["정규직", "계약직", "아르바이트", "프리랜서(위촉직)", "파트타임", "교육생/연수생", "인턴", "기타"];
const SALARY_TYPES = ["시급", "월급", "건당", "협의", "직접 입력"];
const HEADCOUNT_OPTIONS = ["1명", "2~3명", "4명 이상", "직접 입력"];
const PREFERENCES_OPTIONS = ["동종업계 경력자", "관련 자격증 소지자", "장기근무 가능자", "초보 가능", "인근 거주자", "대학생 가능", "운전 가능자"];
const BENEFITS_OPTIONS = ["4대보험", "인센티브", "식대지원", "회원권 제공", "교육 지원", "퇴직금"];
const DEADLINE_OPTIONS = ["상시모집", "정원마감시", "채용시까지", "직접 입력"];
const AUTHOR_ROLES = ["관리자", "대표", "기타"];

/* ══════════════════════════════════
   메인 페이지
   ══════════════════════════════════ */
export default function JobWritePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cloneId = searchParams.get("clone");
  const { user, loading, signInWithGoogle, signInWithApple, getIdToken, nickname } = useAuth();

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
  const [employmentCustom, setEmploymentCustom] = useState("");
  const [salaryType, setSalaryType] = useState("");
  const [salaryAmount, setSalaryAmount] = useState("");
  const [salaryIncentive, setSalaryIncentive] = useState(false);
  const [salaryQuickPay, setSalaryQuickPay] = useState(false);
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [headcount, setHeadcount] = useState("");
  const [headcountCustom, setHeadcountCustom] = useState("");
  const [preferences, setPreferences] = useState<string[]>([]);
  const [benefits, setBenefits] = useState<string[]>([]);
  const [agreed, setAgreed] = useState(false);

  /* 재게시(복제): ?clone=<id> 이면 기존 글 불러와 필드 프리필 */
  useEffect(() => {
    if (!cloneId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/jobs/${cloneId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setTitle(data.title || "");
        setDescription(data.description || "");
        setCenterName(data.center_name || "");
        setAddress(data.address || "");
        if (data.author_role && AUTHOR_ROLES.includes(data.author_role)) setAuthorRole(data.author_role);
        setAuthorName(data.author_name || "");
        setContact(data.contact || "");
        setSport(data.sport || "");
        setRegionName(data.region_name || "");
        setRegionCode(data.region_code || "");
        setEmploymentType(data.employment_type || "");
        const hc = parseHeadcount(data.headcount || "");
        setHeadcount(hc.headcount);
        setHeadcountCustom(hc.headcountCustom);
        setBenefits(parseList(data.benefits || ""));
        setPreferences(parseList(data.preferences || ""));
        const ps = parseSalary(data.salary || "");
        setSalaryType(ps.salaryType);
        setSalaryAmount(ps.salaryAmount);
        setSalaryIncentive(ps.salaryIncentive);
        setSalaryQuickPay(ps.salaryQuickPay);
        const pd = parseDeadline(data.deadline || "");
        setDeadlineType(pd.deadlineType);
        setDeadlineDate(pd.deadlineDate);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [cloneId]);

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
    if (salaryType === "직접 입력") {
      if (!salaryMin && !salaryMax) return "";
      if (salaryMin && salaryMax) return `${salaryMin}만원 ~ ${salaryMax}만원`;
      if (salaryMin) return `${salaryMin}만원 이상`;
      return `${salaryMax}만원 이하`;
    }
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
      [!employmentType || (employmentType === "기타" && !employmentCustom.trim()), "employment", "근무형태"],
      [!salaryType || (salaryType === "직접 입력" && !salaryMin && !salaryMax), "salary", "급여"],
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
          employment_type: employmentType === "기타" ? (employmentCustom.trim() || "기타") : employmentType,
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

  if (loading) return (
    <div className="flex justify-center items-center min-h-screen bg-[#F8F4EC] dark:bg-zinc-950">
      <div className="w-7 h-7 border-2 border-[#6B7B3A] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  /* ══════════════════════════════════
     비로그인 상태
     ══════════════════════════════════ */
  if (!user) return (
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950">
      <div className="relative bg-gradient-to-b from-[#FBF7EB] via-[#F8F4EC] to-[#F8F4EC] dark:from-zinc-900 dark:to-zinc-950 overflow-hidden">
        <div aria-hidden className="absolute -top-24 left-1/2 -translate-x-1/2 w-[600px] h-60 rounded-full bg-[#6B7B3A]/[0.05] blur-3xl pointer-events-none" />
        <div className="relative flex flex-col items-center justify-center min-h-[85vh] px-4">
          <div className="w-full max-w-md bg-[#FEFCF7] dark:bg-zinc-900 rounded-3xl shadow-[0_1px_0_rgba(0,0,0,0.02),0_16px_40px_-20px_rgba(107,93,71,0.25)] border border-[#E8E0D0] dark:border-zinc-700 p-8 sm:p-10 text-center relative overflow-hidden">
            <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/40 to-transparent" />

            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center mx-auto mb-5">
                <svg className="w-8 h-8 text-[#6B7B3A] dark:text-[#A8B87A]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div className="inline-flex items-center gap-2 mb-3">
                <span className="w-6 h-px bg-[#6B7B3A]" />
                <span className="text-[11px] font-bold tracking-[0.15em] text-[#6B7B3A] uppercase">Sign In</span>
                <span className="w-6 h-px bg-[#6B7B3A]" />
              </div>
              <h2 className="text-xl font-bold text-[#2A251D] dark:text-zinc-100 mb-2 tracking-tight">로그인하고 공고를 등록하세요</h2>
              <p className="text-[13px] text-[#6B5D47] dark:text-zinc-400 mb-6 leading-relaxed">
                로그인하면 공고 작성, 수정, 관리 등<br />
                우리 센터의 채용을 손쉽게 진행할 수 있어요
              </p>
              <button onClick={signInWithGoogle} className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-[#FEFCF7] dark:bg-zinc-800 border border-[#E8E0D0] dark:border-zinc-600 rounded-2xl text-sm font-semibold text-[#3A342A] dark:text-zinc-200 hover:bg-[#F5F0E5] dark:hover:bg-zinc-700 hover:border-[#6B7B3A]/40 transition-all mb-2">
                <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Google로 로그인
              </button>
              <button onClick={signInWithApple} className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-[#2A251D] text-white rounded-2xl text-sm font-semibold hover:bg-black transition-all">
                <svg className="w-5 h-5" viewBox="0 0 384 512" fill="currentColor"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>
                Apple로 로그인
              </button>
              <p className="text-[11px] text-[#A89B80] dark:text-zinc-500 mt-4">가입 없이 바로 시작할 수 있어요</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  /* ══════════════════════════════════
     메인 폼
     ══════════════════════════════════ */
  return (
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950 pb-28">
      {/* 헤더 바 */}
      <div className="sticky top-14 z-30 bg-[#F8F4EC]/85 dark:bg-zinc-950/85 backdrop-blur-md border-b border-[#E8E0D0]/70 dark:border-zinc-800">
        <div className="mx-auto max-w-2xl flex items-center gap-2 px-4 sm:px-6 py-3">
          <Link
            href="/jobs"
            className="inline-flex items-center gap-1.5 -ml-1 px-1 py-0.5 rounded-lg text-[#6B7B3A] hover:bg-[#F5F0E5]/60 dark:hover:bg-zinc-800 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-[11px] font-bold tracking-[0.15em] uppercase">스포츠 구인</span>
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-6 space-y-5">
        {/* 히어로 인트로 */}
        <section className="relative bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-6 sm:p-8 overflow-hidden shadow-[0_1px_0_rgba(0,0,0,0.02),0_12px_32px_-20px_rgba(107,93,71,0.2)]">
          <div aria-hidden className="absolute -top-20 -right-16 w-56 h-56 rounded-full bg-[#6B7B3A]/[0.06] blur-3xl pointer-events-none" />
          <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/30 to-transparent" />

          <div className="relative">
            <div className="inline-flex items-center gap-2 mb-4">
              <span className="w-6 h-px bg-[#6B7B3A]" />
              <span className="text-[11px] font-bold tracking-[0.15em] text-[#6B7B3A] uppercase">New Posting</span>
            </div>
            <h1 className="text-[22px] sm:text-[26px] font-bold text-[#2A251D] dark:text-zinc-100 leading-tight tracking-tight mb-2">
              우리 센터에 맞는 지도사를<br className="sm:hidden" /> 만나보세요
            </h1>
            <p className="text-[13px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed mb-5 max-w-md">
              필수 정보만 충실히 적어도 좋은 지원자가 찾아옵니다. 아래 세 가지만 기억해 주세요.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {[
                { icon: "✓", label: "정확한 근무조건", desc: "급여·근무형태·인원을 명확히" },
                { icon: "✓", label: "신뢰할 수 있는 연락처", desc: "실제 담당자 정보를 입력" },
                { icon: "✓", label: "사실 기반 설명", desc: "허위·과장 내용 금지" },
              ].map((tip) => (
                <div key={tip.label} className="flex items-start gap-2 px-3 py-2.5 rounded-2xl bg-[#F5F0E5]/60 dark:bg-zinc-800/60 border border-[#E8E0D0]/60 dark:border-zinc-700">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-[#6B7B3A] text-white text-[10px] font-bold flex items-center justify-center">
                    {tip.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-[#2A251D] dark:text-zinc-100 leading-tight">{tip.label}</p>
                    <p className="text-[11px] text-[#6B5D47] dark:text-zinc-500 mt-0.5 leading-tight">{tip.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-2 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-2xl">
            <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-[13px] text-red-600 font-medium">{error}</p>
          </div>
        )}

        <p className="text-[11px] text-[#A89B80] px-1"><span className="text-[#C0392B] font-bold">*</span> 표시는 필수 입력 항목입니다</p>

        {/* ─── 섹션 1: 기본 공고 정보 ─── */}
        <Section number={1} title="기본 공고 정보" subtitle="지원자가 가장 먼저 확인하는 정보입니다">
          <div ref={fieldRefs.region}>
            <Field label="지역" required>
              <button
                onClick={() => { setShowRegion(true); setRegionStep("group"); }}
                className={`w-full flex items-center justify-between px-4 py-3 border rounded-xl text-[14px] text-left transition-colors ${
                  regionName
                    ? "border-[#6B7B3A]/40 bg-[#FBF7EB] dark:bg-zinc-800 text-[#2A251D] dark:text-zinc-100 font-medium"
                    : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB] dark:bg-zinc-800 text-[#A89B80]"
                } hover:border-[#6B7B3A]/50`}
              >
                <span className="inline-flex items-center gap-2 truncate">
                  <svg className="w-4 h-4 text-[#6B7B3A] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                  {regionName || "지역을 선택해 주세요"}
                </span>
                <svg className="w-4 h-4 text-[#A89B80] shrink-0 ml-2" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </Field>
          </div>

          <div ref={fieldRefs.sport}>
            <Field label="종목" required>
              <SelectButton value={sport} placeholder="종목을 선택해 주세요" onClick={() => { setShowSport(true); setSportSearch(""); }} />
            </Field>
          </div>

          <div ref={fieldRefs.centerName}>
            <Field label="업체명" required count={centerName.length} max={30}>
              <input type="text" value={centerName} onChange={e => setCenterName(e.target.value.slice(0, 30))} placeholder="센터명 또는 기관명" className={inputCls} />
            </Field>
          </div>

          <div ref={fieldRefs.address}>
            <Field label="업체 주소" required>
              <input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="예 : 중구 세종대로 110" className={inputCls} />
            </Field>
          </div>
        </Section>

        {/* ─── 섹션 2: 담당자 정보 ─── */}
        <Section number={2} title="담당자 정보" subtitle="지원자가 실제 연락할 수 있는 담당자 정보를 입력하세요">
          <div ref={fieldRefs.authorName}>
            <Field label="작성자 정보" required>
              <div className="space-y-2">
                <div className="flex gap-1.5">
                  {AUTHOR_ROLES.map(r => (
                    <button key={r} onClick={() => setAuthorRole(r)}
                      className={`flex-1 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all ${
                        authorRole === r
                          ? "bg-[#6B7B3A] text-white shadow-[0_2px_8px_-2px_rgba(107,123,58,0.4)]"
                          : "bg-[#FBF7EB] dark:bg-zinc-800 text-[#6B5D47] dark:text-zinc-400 border border-[#E8E0D0] dark:border-zinc-700 hover:border-[#6B7B3A]/40"
                      }`}>
                      {r}
                    </button>
                  ))}
                </div>
                <input type="text" value={authorName} onChange={e => setAuthorName(e.target.value)} placeholder="실명 입력" className={inputCls} />
              </div>
            </Field>
          </div>

          <div ref={fieldRefs.contact}>
            <Field label="연락처" required hint="전화번호">
              <input type="tel" value={contact} onChange={e => setContact(formatPhone(e.target.value))} placeholder="010-0000-0000" maxLength={13} className={inputCls} />
            </Field>
          </div>
        </Section>

        {/* ─── 섹션 3: 공고 내용 ─── */}
        <Section number={3} title="공고 내용" subtitle="매력적인 제목과 상세 설명으로 좋은 지원자를 만나세요">
          <div ref={fieldRefs.title}>
            <Field label="제목" required count={title.length} max={50}>
              <input type="text" value={title} onChange={e => setTitle(e.target.value.slice(0, 50))} placeholder="예) 강남구 프리랜서 트레이너 정규직 채용" className={inputCls} />
            </Field>
          </div>

          <div ref={fieldRefs.description}>
            <Field label="내용" required count={description.length} max={1000}>
              <textarea value={description} onChange={e => setDescription(e.target.value.slice(0, 1000))}
                placeholder="업무 내용, 우대 조건, 근무 분위기 등을 자유롭게 작성하세요."
                rows={6} style={{ minHeight: 160 }} className={`${inputCls} resize-none leading-relaxed`} />
            </Field>
          </div>
        </Section>

        {/* ─── 섹션 4: 근무 조건 ─── */}
        <Section number={4} title="근무 조건" subtitle="근무 기간·형태·급여 조건을 명확히 입력하세요">
          <div ref={fieldRefs.deadline}>
            <Field label="모집기간" required>
              <SelectButton value={deadlineDisplay} placeholder="모집기간을 선택해 주세요" onClick={() => setShowDeadline(true)} />
            </Field>
          </div>

          <div ref={fieldRefs.employment}>
            <Field label="근무형태" required>
              <SelectButton value={employmentType === "기타" ? (employmentCustom || "기타") : employmentType} placeholder="근무형태를 선택해 주세요" onClick={() => setShowEmployment(true)} />
            </Field>
          </div>

          <div ref={fieldRefs.salary}>
            <Field label="급여" required>
              <SelectButton value={salaryDisplay} placeholder="급여를 선택해 주세요" onClick={() => setShowSalary(true)} />
            </Field>
          </div>

          <div ref={fieldRefs.headcount}>
            <Field label="모집 인원" required>
              <SelectButton value={headcountDisplay} placeholder="모집 인원을 선택해 주세요" onClick={() => setShowHeadcount(true)} />
            </Field>
          </div>
        </Section>

        {/* ─── 섹션 5: 추가 정보 (선택) ─── */}
        <Section number={5} title="추가 정보" subtitle="선택 입력 — 공고의 매력도를 높여줍니다">
          <Field label="우대 조건" hint="선택">
            <SelectButton value={preferences.length ? preferences.join(", ") : ""} placeholder="해당하는 조건을 선택하세요" onClick={() => setShowPreferences(true)} />
          </Field>

          <Field label="복리후생" hint="선택">
            <SelectButton value={benefits.length ? benefits.join(", ") : ""} placeholder="제공하는 복리후생을 선택하세요" onClick={() => setShowBenefits(true)} />
          </Field>
        </Section>

        {/* ─── 동의 ─── */}
        <section className="bg-[#FBF7EB] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-5 sm:p-6">
          <button onClick={() => setAgreed(!agreed)} className="flex items-start gap-3 text-left w-full">
            <span className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
              agreed
                ? "bg-[#6B7B3A] shadow-[0_2px_8px_-2px_rgba(107,123,58,0.4)]"
                : "border-2 border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800"
            }`}>
              {agreed && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
            </span>
            <span className="text-[12px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed">
              작성한 구인 정보는 <span className="font-semibold text-[#3A342A]">사실이며</span>, 허위/불법 내용에 대한 책임은 작성자 본인에게 있습니다. 모두의 지도사는 채용 및 고용 계약에 관여하지 않습니다.
            </span>
          </button>
        </section>
      </div>

      {/* 하단 고정 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-[#F8F4EC] via-[#F8F4EC]/95 to-[#F8F4EC]/0 dark:from-zinc-950 dark:via-zinc-950/95 dark:to-zinc-950/0 pt-6 pb-4 z-20 pointer-events-none" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}>
        <div className="mx-auto max-w-2xl px-4 sm:px-6 pointer-events-auto">
          <button
            onClick={() => { if (validate()) { setShowConfirm(true); setConfirmChecked(false); } }}
            disabled={submitting}
            className="w-full py-4 bg-[#6B7B3A] hover:bg-[#5A6930] text-white font-bold text-[15px] rounded-2xl disabled:opacity-50 shadow-[0_12px_32px_-12px_rgba(107,123,58,0.6)] transition-all hover:-translate-y-0.5"
          >
            {submitting ? "등록 중..." : "공고 등록하기"}
          </button>
        </div>
      </div>

      {/* ══════ 모달들 ══════ */}

      {/* 지역 선택 모달 */}
      <Modal open={showRegion} onClose={() => setShowRegion(false)} title={regionStep === "group" ? "지역 선택" : selectedGroup?.name || ""} subtitle="광역시/도를 선택한 후 세부 지역을 선택하세요">
        {regionStep === "group" ? (
          <div>{REGION_GROUPS.map(g => (
            <button key={g.code} onClick={() => { setSelectedGroup(g); setRegionStep("sub"); }}
              className="w-full flex items-center justify-between px-5 py-4 text-[14px] text-[#3A342A] dark:text-zinc-100 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 border-b border-[#E8E0D0]/60 dark:border-zinc-800 last:border-0 transition-colors">
              <span>{g.name}</span>
              <svg className="w-4 h-4 text-[#A89B80]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          ))}</div>
        ) : (
          <div>
            <button onClick={() => setRegionStep("group")} className="w-full flex items-center gap-1 px-5 py-3 text-[13px] text-[#8C8270] hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 border-b border-[#E8E0D0]/60 dark:border-zinc-800 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>뒤로
            </button>
            {selectedGroup?.subRegions.map(s => (
              <button key={s.code} onClick={() => handleRegionSelect(s.code, s.name)}
                className={`w-full text-left px-5 py-4 text-[14px] hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 border-b border-[#E8E0D0]/60 dark:border-zinc-800 last:border-0 transition-colors ${
                  regionCode === s.code ? "text-[#6B7B3A] dark:text-[#A8B87A] font-semibold bg-[#F5F0E5]/50" : "text-[#3A342A] dark:text-zinc-100"
                }`}>
                {s.name}
              </button>
            ))}
          </div>
        )}
      </Modal>

      {/* 종목 선택 모달 */}
      <Modal open={showSport} onClose={() => setShowSport(false)} title="종목 선택" subtitle="카테고리를 검색하거나 선택하세요">
        <div className="px-5 py-3 sticky top-0 bg-[#FEFCF7] dark:bg-zinc-900 z-10 border-b border-[#E8E0D0]/60 dark:border-zinc-800">
          <div className="flex items-center gap-2 px-3.5 py-2.5 border border-[#E8E0D0] dark:border-zinc-700 rounded-xl bg-[#FBF7EB] dark:bg-zinc-800 focus-within:border-[#6B7B3A]/50 focus-within:bg-[#FEFCF7] transition-colors">
            <svg className="w-4 h-4 text-[#A89B80] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={sportSearch} onChange={e => setSportSearch(e.target.value)} placeholder="종목 검색 (초성 가능)"
              className="flex-1 text-[13px] bg-transparent text-[#3A342A] dark:text-zinc-100 placeholder-[#A89B80] focus:outline-none" />
          </div>
        </div>
        <div>
          {categories.filter(c => matchSearch(c.name, sportSearch)).map(c => (
            <RadioItem key={c.id} label={`${c.emoji} ${c.name}`} selected={sport === c.name}
              onSelect={() => { setSport(c.name); setShowSport(false); }} />
          ))}
          {categories.filter(c => matchSearch(c.name, sportSearch)).length === 0 && (
            <p className="text-center text-[13px] text-[#A89B80] py-10">일치하는 종목이 없습니다</p>
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
            <div className="px-5 py-4 border-t border-[#E8E0D0]/70 dark:border-zinc-800 space-y-2.5">
              <input type="date" value={deadlineDate} onChange={e => setDeadlineDate(e.target.value)} className={inputCls} />
              <button onClick={() => { if (deadlineDate) setShowDeadline(false); }}
                className="w-full py-3 bg-[#6B7B3A] hover:bg-[#5A6930] text-white text-[13px] font-semibold rounded-xl disabled:opacity-50 shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)] transition-colors" disabled={!deadlineDate}>확인</button>
            </div>
          )}
        </div>
      </Modal>

      {/* 근무형태 모달 */}
      <Modal open={showEmployment} onClose={() => setShowEmployment(false)} title="근무형태 선택">
        <div>
          {EMPLOYMENT_TYPES.map(t => (
            <RadioItem key={t} label={t} selected={employmentType === t} onSelect={() => {
              setEmploymentType(t);
              if (t !== "기타") { setEmploymentCustom(""); setShowEmployment(false); }
            }} />
          ))}
          {employmentType === "기타" && (
            <div className="px-5 py-4 border-t border-[#E8E0D0]/70 dark:border-zinc-800 space-y-2.5">
              <input type="text" value={employmentCustom} onChange={e => setEmploymentCustom(e.target.value)}
                placeholder="근무형태를 입력해 주세요" className={inputCls} maxLength={50} />
              <button onClick={() => { if (employmentCustom.trim()) setShowEmployment(false); }} disabled={!employmentCustom.trim()}
                className="w-full py-3 bg-[#6B7B3A] hover:bg-[#5A6930] text-white text-[13px] font-semibold rounded-xl disabled:opacity-50 shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)] transition-colors">확인</button>
            </div>
          )}
        </div>
      </Modal>

      {/* 급여 모달 */}
      <Modal open={showSalary} onClose={() => setShowSalary(false)} title="급여 선택">
        <div>
          {SALARY_TYPES.map(t => (
            <RadioItem key={t} label={t} selected={salaryType === t} onSelect={() => {
              setSalaryType(t);
              if (t === "협의") { setSalaryAmount(""); setSalaryIncentive(false); setSalaryQuickPay(false); setSalaryMin(""); setSalaryMax(""); setShowSalary(false); }
              if (t === "직접 입력") { setSalaryAmount(""); setSalaryIncentive(false); setSalaryQuickPay(false); }
              if (t !== "협의" && t !== "직접 입력") { setSalaryMin(""); setSalaryMax(""); }
            }} />
          ))}
          {salaryType === "직접 입력" && (
            <div className="px-5 py-4 border-t border-[#E8E0D0]/70 dark:border-zinc-800 space-y-3">
              <div className="flex items-center gap-2">
                <input type="text" value={salaryMin} onChange={e => setSalaryMin(formatMoney(e.target.value))}
                  placeholder="최소 금액" className={`${inputCls} flex-1`} inputMode="numeric" />
                <span className="text-[13px] font-semibold text-[#6B5D47] shrink-0">만원</span>
                <span className="text-[13px] text-[#A89B80]">~</span>
                <input type="text" value={salaryMax} onChange={e => setSalaryMax(formatMoney(e.target.value))}
                  placeholder="최대 금액" className={`${inputCls} flex-1`} inputMode="numeric" />
                <span className="text-[13px] font-semibold text-[#6B5D47] shrink-0">만원</span>
              </div>
              <button onClick={() => { if (salaryMin || salaryMax) setShowSalary(false); }} disabled={!salaryMin && !salaryMax}
                className="w-full py-3 bg-[#6B7B3A] hover:bg-[#5A6930] text-white text-[13px] font-semibold rounded-xl disabled:opacity-50 shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)] transition-colors">확인</button>
            </div>
          )}
          {salaryType && salaryType !== "협의" && salaryType !== "직접 입력" && (
            <div className="px-5 py-4 border-t border-[#E8E0D0]/70 dark:border-zinc-800 space-y-3">
              <div className="flex items-center gap-2">
                <input type="text" value={salaryAmount} onChange={e => setSalaryAmount(formatMoney(e.target.value))}
                  placeholder="금액 입력" className={`${inputCls} flex-1`} inputMode="numeric" />
                <span className="text-[13px] font-semibold text-[#6B5D47] shrink-0">원</span>
              </div>
              <label className="flex items-center gap-2.5 text-[13px] text-[#6B5D47] dark:text-zinc-400 cursor-pointer">
                <input type="checkbox" checked={salaryIncentive} onChange={e => setSalaryIncentive(e.target.checked)} className="w-4 h-4 rounded accent-[#6B7B3A]" />
                인센티브 있음
              </label>
              <label className="flex items-center gap-2.5 text-[13px] text-[#6B5D47] dark:text-zinc-400 cursor-pointer">
                <input type="checkbox" checked={salaryQuickPay} onChange={e => setSalaryQuickPay(e.target.checked)} className="w-4 h-4 rounded accent-[#6B7B3A]" />
                주급/당일지급 가능
              </label>
              <button onClick={() => { if (salaryAmount) setShowSalary(false); }} disabled={!salaryAmount}
                className="w-full py-3 bg-[#6B7B3A] hover:bg-[#5A6930] text-white text-[13px] font-semibold rounded-xl disabled:opacity-50 shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)] transition-colors">확인</button>
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
            <div className="px-5 py-4 border-t border-[#E8E0D0]/70 dark:border-zinc-800 space-y-2.5">
              <input type="text" value={headcountCustom} onChange={e => setHeadcountCustom(e.target.value)} placeholder="예: 5명" className={inputCls} />
              <button onClick={() => { if (headcountCustom.trim()) setShowHeadcount(false); }} disabled={!headcountCustom.trim()}
                className="w-full py-3 bg-[#6B7B3A] hover:bg-[#5A6930] text-white text-[13px] font-semibold rounded-xl disabled:opacity-50 shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)] transition-colors">확인</button>
            </div>
          )}
        </div>
      </Modal>

      {/* 우대 조건 모달 */}
      <Modal open={showPreferences} onClose={() => setShowPreferences(false)} title="우대 조건"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setShowPreferences(false)} className="flex-1 py-3 border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800 rounded-xl text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5] transition-colors">취소</button>
            <button onClick={() => setShowPreferences(false)} className="flex-1 py-3 bg-[#6B7B3A] hover:bg-[#5A6930] text-white rounded-xl text-[13px] font-semibold shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)] transition-colors">확인</button>
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
            <button onClick={() => setShowBenefits(false)} className="flex-1 py-3 border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800 rounded-xl text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5] transition-colors">취소</button>
            <button onClick={() => setShowBenefits(false)} className="flex-1 py-3 bg-[#6B7B3A] hover:bg-[#5A6930] text-white rounded-xl text-[13px] font-semibold shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)] transition-colors">확인</button>
          </div>
        }>
        <div>{BENEFITS_OPTIONS.map(o => (
          <CheckItem key={o} label={o} checked={benefits.includes(o)} onToggle={() => setBenefits(prev => prev.includes(o) ? prev.filter(x => x !== o) : [...prev, o])} />
        ))}</div>
      </Modal>

      {/* 등록 전 확인 모달 */}
      <Modal open={showConfirm} onClose={() => setShowConfirm(false)}
        icon={
          <div className="w-14 h-14 rounded-2xl bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center">
            <svg className="w-7 h-7 text-[#6B7B3A] dark:text-[#A8B87A]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
        }
        title="등록 전 한 번만 확인해 주세요"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setShowConfirm(false)} className="flex-1 py-3 border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800 rounded-xl text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5] transition-colors">취소</button>
            <button onClick={() => { setShowConfirm(false); handleSubmit(); }} disabled={!confirmChecked || submitting}
              className={`flex-1 py-3 rounded-xl text-[13px] font-semibold transition-all ${
                confirmChecked
                  ? "bg-[#6B7B3A] text-white hover:bg-[#5A6930] shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)]"
                  : "bg-[#F5F0E5] text-[#A89B80] dark:bg-zinc-700 dark:text-zinc-400 cursor-not-allowed"
              }`}>
              {submitting ? "등록 중..." : "최종 등록하기"}
            </button>
          </div>
        }>
        <div className="px-5 py-4 space-y-3">
          <div className="p-4 bg-[#FBF7EB] dark:bg-zinc-800/60 border border-[#E8E0D0]/70 dark:border-zinc-700 rounded-2xl">
            <p className="text-[13px] text-[#3A342A] dark:text-zinc-300 leading-relaxed">
              허위 구인 또는 실제 근무조건과 다른 내용 기재 시 <span className="font-semibold">게시글 삭제, 계정 정지</span> 등의 조치가 이루어질 수 있습니다.
            </p>
            <p className="text-[11px] text-[#8C8270] mt-2">공고 내용에 대한 책임은 작성자에게 있습니다.</p>
          </div>
          <button onClick={() => setConfirmChecked(!confirmChecked)} className="w-full flex items-center gap-2.5 pt-1">
            <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
              confirmChecked
                ? "bg-[#6B7B3A] shadow-[0_2px_8px_-2px_rgba(107,123,58,0.4)]"
                : "border-2 border-[#E8E0D0] dark:border-zinc-700"
            }`}>
              {confirmChecked && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
            </span>
            <span className="text-[13px] text-[#3A342A] dark:text-zinc-300 font-medium">위 내용을 확인했으며 동의합니다.</span>
          </button>
        </div>
      </Modal>
    </div>
  );
}
