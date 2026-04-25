"use client";

import { useEffect, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
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

/* 기존 저장된 값 파싱 */
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

const EMPLOYMENT_TYPES = ["정규직", "계약직", "아르바이트", "프리랜서(위촉직)", "파트타임", "교육생/연수생", "인턴"];
const SALARY_TYPES = ["시급", "월급", "건당", "협의"];
const HEADCOUNT_OPTIONS = ["1명", "2~3명", "4명 이상", "직접 입력"];
const PREFERENCES_OPTIONS = ["동종업계 경력자", "관련 자격증 소지자", "장기근무 가능자", "초보 가능", "인근 거주자", "대학생 가능", "운전 가능자"];
const BENEFITS_OPTIONS = ["4대보험", "인센티브", "식대지원", "회원권 제공", "교육 지원", "퇴직금"];
const DEADLINE_OPTIONS = ["상시모집", "정원마감시", "직접 입력"];
const AUTHOR_ROLES = ["관리자", "대표", "기타"];

/* ══════════════════════════════════
   메인 페이지 - 구인글 수정
   ══════════════════════════════════ */
export default function JobEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = use(params);
  const router = useRouter();
  const { user, loading: authLoading, getIdToken, nickname } = useAuth();

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
  const [contactType, setContactType] = useState<"연락처" | "이메일">("연락처");
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
  const [agreed, setAgreed] = useState(true); // 수정 시 자동 체크

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
  const [loadingData, setLoadingData] = useState(true);
  const [notFound, setNotFound] = useState(false);

  /* refs for scroll */
  const fieldRefs: Record<string, React.RefObject<HTMLDivElement | null>> = {
    region: useRef(null), sport: useRef(null), centerName: useRef(null),
    address: useRef(null), authorName: useRef(null), contact: useRef(null),
    title: useRef(null), description: useRef(null), deadline: useRef(null),
    employment: useRef(null), salary: useRef(null), headcount: useRef(null),
  };

  /* 기존 데이터 로드 & 파싱 */
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) { setNotFound(true); return; }
        const data = await res.json();

        setTitle(data.title || "");
        setDescription(data.description || "");
        setCenterName(data.center_name || "");
        setAddress(data.address || "");
        setAuthorRole(data.author_role && AUTHOR_ROLES.includes(data.author_role) ? data.author_role : "관리자");
        setAuthorName(data.author_name || "");
        setContactType(data.contact_type === "이메일" ? "이메일" : "연락처");
        setContact(data.contact || "");
        setSport(data.sport || "");
        setRegionName(data.region_name || "");
        setRegionCode(data.region_code || "");
        setEmploymentType(data.employment_type || "");
        setHeadcount(parseHeadcount(data.headcount || "").headcount);
        setHeadcountCustom(parseHeadcount(data.headcount || "").headcountCustom);
        setBenefits(parseList(data.benefits || ""));
        setPreferences(parseList(data.preferences || ""));

        const parsedSalary = parseSalary(data.salary || "");
        setSalaryType(parsedSalary.salaryType);
        setSalaryAmount(parsedSalary.salaryAmount);
        setSalaryIncentive(parsedSalary.salaryIncentive);
        setSalaryQuickPay(parsedSalary.salaryQuickPay);

        const parsedDeadline = parseDeadline(data.deadline || "");
        setDeadlineType(parsedDeadline.deadlineType);
        setDeadlineDate(parsedDeadline.deadlineDate);
      } catch {
        setNotFound(true);
      } finally {
        setLoadingData(false);
      }
    }
    load();
  }, [jobId]);

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

  const deadlineDisplay = deadlineType === "직접 입력" && deadlineDate
    ? `${deadlineDate}까지`
    : deadlineType;

  const headcountDisplay = headcount === "직접 입력" ? headcountCustom : headcount;

  /* 유효성 검사 */
  const validate = () => {
    if (!user) { alert("수정은 로그인 후 가능합니다."); return false; }
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
    if (contactType === "이메일" && !/.+@.+\..+/.test(contact.trim())) {
      fieldRefs.contact?.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      alert("올바른 이메일 주소가 아닙니다.");
      return false;
    }
    if (!agreed) { alert("동의 항목을 체크해주세요."); return false; }
    return true;
  };

  /* 수정 */
  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const token = await getIdToken();
      const salaryText = salaryDisplay;
      const deadlineText = deadlineDisplay;
      const headcountText = headcountDisplay;

      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          center_name: centerName.trim(),
          address: address.trim(),
          author_role: authorRole,
          author_name: authorName.trim() || (nickname || user?.displayName || ""),
          contact_type: contactType,
          contact: contact.trim(),
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
      if (!res.ok) { setError(data.error || "수정에 실패했습니다."); return; }
      router.replace(`/jobs/${jobId}`);
    } catch {
      setError("오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || loadingData) return (
    <div className="flex justify-center items-center min-h-screen bg-[#F8F4EC] dark:bg-zinc-950">
      <div className="w-7 h-7 border-2 border-[#6B7B3A] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (notFound) return (
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950 flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-[14px] text-[#8C8270] mb-4">게시글을 찾을 수 없습니다.</p>
        <button onClick={() => router.back()} className="px-5 py-2.5 rounded-xl bg-[#6B7B3A] hover:bg-[#5A6930] text-white text-[13px] font-semibold">
          돌아가기
        </button>
      </div>
    </div>
  );

  if (!user) return (
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950 flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-[14px] text-[#8C8270] mb-4">로그인이 필요합니다.</p>
        <button onClick={() => router.back()} className="px-5 py-2.5 rounded-xl bg-[#6B7B3A] hover:bg-[#5A6930] text-white text-[13px] font-semibold">
          돌아가기
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950 pb-28">
      {/* 헤더 바 */}
      <div className="sticky top-14 z-30 bg-[#F8F4EC]/85 dark:bg-zinc-950/85 backdrop-blur-md border-b border-[#E8E0D0]/70 dark:border-zinc-800">
        <div className="mx-auto max-w-2xl flex items-center gap-2 px-4 sm:px-6 py-3">
          <Link
            href={`/jobs/${jobId}`}
            className="inline-flex items-center gap-1.5 -ml-1 px-1 py-0.5 rounded-lg text-[#6B7B3A] hover:bg-[#F5F0E5]/60 dark:hover:bg-zinc-800 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-[11px] font-bold tracking-[0.15em] uppercase">공고 글</span>
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
              <span className="text-[11px] font-bold tracking-[0.15em] text-[#6B7B3A] uppercase">Edit Posting</span>
            </div>
            <h1 className="text-[22px] sm:text-[26px] font-bold text-[#2A251D] dark:text-zinc-100 leading-tight tracking-tight mb-2">
              공고 정보를 수정해 주세요
            </h1>
            <p className="text-[13px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed max-w-md">
              변경된 내용이 지원자에게 즉시 반영됩니다. 정확한 정보로 업데이트해 주세요.
            </p>
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
            <Field label="연락처" required hint={contactType === "이메일" ? "이메일" : "전화번호"}>
              <div className="space-y-2">
                <div className="flex gap-1.5">
                  {(["연락처", "이메일"] as const).map(t => (
                    <button key={t} onClick={() => { setContactType(t); setContact(""); }}
                      className={`flex-1 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all ${
                        contactType === t
                          ? "bg-[#6B7B3A] text-white shadow-[0_2px_8px_-2px_rgba(107,123,58,0.4)]"
                          : "bg-[#FBF7EB] dark:bg-zinc-800 text-[#6B5D47] dark:text-zinc-400 border border-[#E8E0D0] dark:border-zinc-700 hover:border-[#6B7B3A]/40"
                      }`}>
                      {t === "연락처" ? "전화번호" : "이메일"}
                    </button>
                  ))}
                </div>
                {contactType === "이메일" ? (
                  <input type="email" inputMode="email" autoComplete="email" value={contact}
                    onChange={e => setContact(e.target.value)}
                    placeholder="example@email.com" maxLength={100} className={inputCls} />
                ) : (
                  <input type="tel" value={contact} onChange={e => setContact(formatPhone(e.target.value))} placeholder="010-0000-0000" maxLength={13} className={inputCls} />
                )}
              </div>
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
              <SelectButton value={employmentType} placeholder="근무형태를 선택해 주세요" onClick={() => setShowEmployment(true)} />
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
              수정한 구인 정보는 <span className="font-semibold text-[#3A342A]">사실이며</span>, 허위/불법 내용에 대한 책임은 작성자 본인에게 있습니다. 모두의 지도사는 채용 및 고용 계약에 관여하지 않습니다.
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
            {submitting ? "수정 중..." : "공고 수정하기"}
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
              <input
                type="date"
                value={deadlineDate}
                onChange={e => setDeadlineDate(e.target.value)}
                onKeyDown={e => e.preventDefault()}
                onBeforeInput={e => e.preventDefault()}
                min={new Date().toISOString().split("T")[0]}
                className={inputCls}
              />
              <p className="text-[11px] text-[#A89B80] dark:text-zinc-500">달력에서 선택해주세요 (직접 타이핑 불가)</p>
              <button onClick={() => { if (deadlineDate) setShowDeadline(false); }}
                className="w-full py-3 bg-[#6B7B3A] hover:bg-[#5A6930] text-white text-[13px] font-semibold rounded-xl disabled:opacity-50 shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)] transition-colors" disabled={!deadlineDate}>확인</button>
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

      {/* 수정 전 확인 모달 */}
      <Modal open={showConfirm} onClose={() => setShowConfirm(false)}
        icon={
          <div className="w-14 h-14 rounded-2xl bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center">
            <svg className="w-7 h-7 text-[#6B7B3A] dark:text-[#A8B87A]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </div>
        }
        title="수정 전 한 번만 확인해 주세요"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setShowConfirm(false)} className="flex-1 py-3 border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800 rounded-xl text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5] transition-colors">취소</button>
            <button onClick={() => { setShowConfirm(false); handleSubmit(); }} disabled={!confirmChecked || submitting}
              className={`flex-1 py-3 rounded-xl text-[13px] font-semibold transition-all ${
                confirmChecked
                  ? "bg-[#6B7B3A] text-white hover:bg-[#5A6930] shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)]"
                  : "bg-[#F5F0E5] text-[#A89B80] dark:bg-zinc-700 dark:text-zinc-400 cursor-not-allowed"
              }`}>
              {submitting ? "수정 중..." : "수정 완료"}
            </button>
          </div>
        }>
        <div className="px-5 py-4 space-y-3">
          <div className="p-4 bg-[#FBF7EB] dark:bg-zinc-800/60 border border-[#E8E0D0]/70 dark:border-zinc-700 rounded-2xl">
            <p className="text-[13px] text-[#3A342A] dark:text-zinc-300 leading-relaxed">
              수정한 내용이 <span className="font-semibold">지원자에게 즉시 반영</span>됩니다. 정보가 정확한지 확인해 주세요.
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
