"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import imageCompression from "browser-image-compression";
import { REGION_GROUPS, type RegionGroup } from "@/app/lib/region-data";
import { useAuth } from "@/app/components/auth-provider";
import { UploadProgress } from "@/app/components/upload-progress";

/* ══════════════════════════════════
   유틸 (구인 글쓰기와 동일)
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
function formatNumber(v: string) {
  const n = v.replace(/\D/g, "");
  if (!n) return "";
  return Number(n).toLocaleString();
}
function parseNum(v: string) {
  return Number((v || "").replace(/\D/g, "")) || 0;
}

/* ══════════════════════════════════
   프리젠테이셔널 헬퍼 (구인글과 동일)
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

/* 거래 전용 옵션 */
const TRADE_METHODS = [
  { key: "direct", label: "직거래" },
  { key: "parcel", label: "택배거래" },
  { key: "delivery", label: "용달거래" },
  { key: "etc", label: "기타 (직접 입력)" },
] as const;

type TradeMethodKey = typeof TRADE_METHODS[number]["key"];

const NEGOTIABLE_OPTIONS = ["협의가능", "조정불가", "권리금없음"] as const;
const MEMBER_COUNT_TYPES = ["숫자 입력", "기타"] as const;

/* ══════════════════════════════════
   메인 페이지
   ══════════════════════════════════ */
export default function TradeWritePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");
  const isEdit = !!editId;
  const { user, loading, signInWithGoogle, signInWithApple, getIdToken, activeRegionCode, activeRegionName } = useAuth();

  /* 카테고리 (구인글 종목 드롭다운과 동일 패턴 — 업종으로 사용) */
  const [categories, setCategories] = useState<{ id: number; name: string; emoji: string }[]>([]);
  useEffect(() => {
    fetch("/api/categories").then(r => r.json()).then(data => {
      const base = Array.isArray(data) ? data.map((c: { id: number; name: string; emoji: string }) => ({ id: c.id, name: c.name, emoji: c.emoji })) : [];
      setCategories([
        ...base,
        { id: -1, name: "무용", emoji: "💃" },
        { id: -2, name: "기타", emoji: "🏷️" },
      ]);
    }).catch(() => {});
  }, []);

  // 신규 작성 모드 — "내가 활동하는 지역"이 설정돼 있으면 자동 입력
  useEffect(() => {
    if (isEdit) return; // 수정 모드는 기존 값 유지
    if (!activeRegionCode || !activeRegionName) return;
    if (regionCode || regionName) return; // 이미 사용자가 선택했으면 건드리지 않음
    setRegionCode(activeRegionCode);
    setRegionName(activeRegionName);
    setRegionDetail(prev => (prev.trim() ? prev : `${activeRegionName} `));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, activeRegionCode, activeRegionName]);

  // edit 모드 — 기존 글 데이터 로드 후 상태 prefill
  const [editLoaded, setEditLoaded] = useState(!isEdit);
  useEffect(() => {
    if (!isEdit || !editId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getIdToken().catch(() => null);
        const res = await fetch(`/api/trade/${editId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          alert("수정할 글을 불러오지 못했습니다.");
          router.replace("/trade");
          return;
        }
        const p = await res.json();
        if (cancelled) return;
        setTradeCategory(p.category === "center" ? "center" : "equipment");
        setTitle(p.title || "");
        setBody(p.body || "");
        const regionFull = [p.region_sido, p.region_sigungu].filter(Boolean).join(" ");
        setRegionName(regionFull);
        setRegionCode("loaded"); // 비어있지 않게만 (검증 통과용)
        setRegionDetail(p.region_detail || "");
        setContactPhone(p.contact_phone || "");
        setImageUrls(Array.isArray(p.image_urls) ? p.image_urls : []);
        setAgreed(true);
        if (p.category === "equipment") {
          const ei = (p.equipment_info && typeof p.equipment_info === "object" ? p.equipment_info : {}) as Record<string, unknown>;
          const rawItems = Array.isArray(ei.items) ? ei.items as Array<Partial<{ name: string; condition: string; price_manwon: number }>> : [];
          const loaded: EquipItem[] = rawItems.length > 0
            ? rawItems.map(it => ({
                name: String(it.name || ""),
                condition: String(it.condition || ""),
                price: it.price_manwon ? Number(it.price_manwon).toLocaleString() : "",
              }))
            : [{
                name: p.product_name || "",
                condition: p.condition_text || "",
                price: p.price_manwon ? Number(p.price_manwon).toLocaleString() : "",
              }];
          setItems(loaded);
          setCenterName(p.center_name || "");
          const methods = Array.isArray(ei.trade_methods) ? ei.trade_methods as Array<{ type: string; loading?: boolean; text?: string }> : [];
          const methodSet = new Set<TradeMethodKey>();
          for (const m of methods) {
            if (m.type === "direct" || m.type === "parcel" || m.type === "delivery" || m.type === "etc") {
              methodSet.add(m.type as TradeMethodKey);
              if (m.type === "delivery" && m.loading) setDeliveryLoading(true);
              if (m.type === "etc" && m.text) setTradeMethodEtc(m.text);
            }
          }
          setTradeMethods(methodSet);
        } else {
          const ci = (p.center_info && typeof p.center_info === "object" ? p.center_info : {}) as Record<string, unknown>;
          setIndustry(String(ci.industry || ""));
          setStoreType(String(ci.store_type || ""));
          setCenterNameVisible(ci.name_visible ? "public" : "private");
          setCenterNameValue(String(ci.name || ""));
          setAreaPyeong(ci.area_pyeong ? Number(ci.area_pyeong).toLocaleString() : "");
          const money = (k: string) => {
            const m = ci[k] as { amount_manwon?: number } | undefined;
            return m?.amount_manwon ? Number(m.amount_manwon).toLocaleString() : "";
          };
          setDeposit(money("deposit"));
          setMonthly(money("monthly"));
          setMgmtFee(money("mgmt_fee"));
          setPremium(money("premium"));
          const premiumObj = ci.premium as { negotiable?: string } | undefined;
          if (premiumObj?.negotiable === "협의가능" || premiumObj?.negotiable === "조정불가" || premiumObj?.negotiable === "권리금없음") {
            setPremiumNeg(premiumObj.negotiable);
          }
          const mc = ci.member_count as Record<string, unknown> | undefined;
          if (mc?.type === "number") {
            setMemberType("숫자 입력");
            setMemberValue(mc.value ? Number(mc.value).toLocaleString() : "");
          } else if (mc?.type === "etc") {
            setMemberType("기타");
            setMemberEtc(String(mc.text || ""));
          }
        }
        setEditLoaded(true);
      } catch {
        alert("글 정보를 불러오지 못했습니다.");
        router.replace("/trade");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, editId]);

  /* ─── 카테고리 (중고/매매) ─── */
  const [tradeCategory, setTradeCategory] = useState<"equipment" | "center">("equipment");

  /* ─── 공통 폼 상태 ─── */
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [regionCode, setRegionCode] = useState("");
  const [regionName, setRegionName] = useState(""); // "서울 강남구" 형태
  const [regionDetail, setRegionDetail] = useState(""); // 중고거래 필수: 상세 주소(만남 장소·동·번지)
  const [contactPhone, setContactPhone] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [agreed, setAgreed] = useState(false);

  /* ─── equipment 전용 ─── */
  type EquipItem = { name: string; condition: string; price: string };
  const [items, setItems] = useState<EquipItem[]>([{ name: "", condition: "", price: "" }]);
  const [centerName, setCenterName] = useState(""); // 중고: 필수 공개
  const [tradeMethods, setTradeMethods] = useState<Set<TradeMethodKey>>(new Set());
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [tradeMethodEtc, setTradeMethodEtc] = useState("");

  /* ─── center 전용 ─── */
  const [industry, setIndustry] = useState("");          // 업종 (드롭다운)
  const [storeType, setStoreType] = useState("");        // 매장 종류 (직접 입력)
  const [centerNameVisible, setCenterNameVisible] = useState<"public" | "private">("private");
  const [centerNameValue, setCenterNameValue] = useState("");
  const [areaPyeong, setAreaPyeong] = useState("");
  const [deposit, setDeposit] = useState("");
  const [monthly, setMonthly] = useState("");
  const [mgmtFee, setMgmtFee] = useState("");
  const [premium, setPremium] = useState("");
  const [premiumNeg, setPremiumNeg] = useState<typeof NEGOTIABLE_OPTIONS[number]>("협의가능");
  const [memberType, setMemberType] = useState<typeof MEMBER_COUNT_TYPES[number]>("숫자 입력");
  const [memberValue, setMemberValue] = useState("");
  const [memberEtc, setMemberEtc] = useState("");

  /* ─── 모달 상태 ─── */
  const [showRegion, setShowRegion] = useState(false);
  const [regionStep, setRegionStep] = useState<"group" | "sub">("group");
  const [selectedGroup, setSelectedGroup] = useState<RegionGroup | null>(null);
  const [showIndustry, setShowIndustry] = useState(false);
  const [industrySearch, setIndustrySearch] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  /* refs for scroll on validation error */
  const fieldRefs: Record<string, React.RefObject<HTMLDivElement | null>> = {
    region: useRef(null), regionDetail: useRef(null),
    items: useRef(null),
    centerName: useRef(null), tradeMethods: useRef(null), images: useRef(null),
    contact: useRef(null), title: useRef(null), body: useRef(null),
    industry: useRef(null), storeType: useRef(null),
    centerNameValue: useRef(null), area: useRef(null),
    deposit: useRef(null), monthly: useRef(null), member: useRef(null),
  };

  const addItem = () => {
    setItems(prev => prev.length >= 10 ? prev : [...prev, { name: "", condition: "", price: "" }]);
  };
  const removeItem = (idx: number) => {
    setItems(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx));
  };
  const updateItem = (idx: number, key: keyof EquipItem, value: string) => {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, [key]: value } : it)));
  };

  /* 지역 = "시도 시군구" 한 줄 */
  const handleRegionSelect = (code: string, name: string, parent: string) => {
    const fullName = `${parent} ${name}`;
    setRegionCode(code);
    setRegionName(fullName);
    // 상세 주소 칸에 시·군·구 자동 prefix (이전 region prefix 가 있으면 교체, 사용자가 추가한 부분은 보존)
    setRegionDetail(prev => {
      const trimmed = prev.trim();
      if (!trimmed) return `${fullName} `;
      // 이전 prefix(같은 시·도 또는 다른 시·도)를 검출해서 교체
      // 예) "서울 강남구 역삼동" → 새 지역 선택 시 "{새지역} 역삼동"
      const tokens = trimmed.split(/\s+/);
      // 첫 2 토큰이 "시도 시군구" 형태일 가능성이 높음 → 제거 후 새 prefix
      if (tokens.length >= 2) {
        const rest = tokens.slice(2).join(" ");
        return rest ? `${fullName} ${rest}` : `${fullName} `;
      }
      return `${fullName} ${trimmed}`;
    });
    setShowRegion(false);
  };

  /* 이미지 업로드 (1~10장, 클라이언트 측 200KB 압축) */
  const handleImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = 10 - imageUrls.length;
    if (remaining <= 0) {
      alert("사진은 최대 10장까지 등록할 수 있습니다.");
      return;
    }
    const list = Array.from(files).slice(0, remaining);
    setUploading(true);
    try {
      // 압축 (가로 1920px / 0.2MB target / WebP)
      const compressed: File[] = [];
      for (const f of list) {
        const out = await imageCompression(f, {
          maxSizeMB: 0.2,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
          fileType: "image/webp",
          initialQuality: 0.85,
        });
        compressed.push(new File([out], f.name.replace(/\.\w+$/, ".webp"), { type: "image/webp" }));
      }

      const fd = new FormData();
      compressed.forEach(f => fd.append("images", f));
      const token = await getIdToken();
      const res = await fetch("/api/trade/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "업로드 실패");
      setImageUrls(prev => [...prev, ...(data.urls || [])]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "이미지 업로드 실패";
      alert(msg);
    } finally {
      setUploading(false);
    }
  };

  /* 거래 방식 토글 */
  const toggleMethod = (key: TradeMethodKey) => {
    setTradeMethods(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /* 유효성 검사 — alert 가 닫힌 후 해당 입력란으로 스크롤 */
  const failValidation = (refKey: keyof typeof fieldRefs | null, message: string): false => {
    alert(message);
    if (refKey && fieldRefs[refKey]?.current) {
      // alert 닫힌 직후 다음 tick 에 스크롤 (브라우저 alert 가 동기 블록 후 해제되므로)
      setTimeout(() => {
        fieldRefs[refKey]?.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
    }
    return false;
  };

  const validate = (): boolean => {
    if (!user) return failValidation(null, "거래 등록은 로그인 후 가능합니다.");

    if (!title.trim()) return failValidation("title", "제목을 입력해주세요.");
    if (!regionCode || !regionName.includes(" ")) return failValidation("region", "지역을 시·군·구까지 선택해주세요.");
    if (imageUrls.length < 1) return failValidation("images", "사진을 최소 1장 등록해주세요.");
    if (!contactPhone.trim()) return failValidation("contact", "연락처를 입력해주세요.");

    if (tradeCategory === "equipment") {
      if (!centerName.trim()) return failValidation("centerName", "센터명은 중고거래에서 필수입니다.");
      // 상세 주소: 자동 prefix(시·도 시·군·구) 외 추가 입력 필수
      const trimmedDetail = regionDetail.trim();
      const regionPrefix = regionName.trim();
      if (!trimmedDetail) return failValidation("regionDetail", "중고거래는 추가 상세 주소를 입력해주세요.");
      const extra = regionPrefix && trimmedDetail.startsWith(regionPrefix)
        ? trimmedDetail.slice(regionPrefix.length).trim()
        : trimmedDetail;
      if (!extra) return failValidation("regionDetail", "추가 상세 주소를 입력해주세요.");
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const prefix = items.length > 1 ? `${i + 1}번 물품의 ` : "";
        if (!it.name.trim()) return failValidation("items", `${prefix}제품명을 입력해주세요.`);
        if (!it.condition.trim()) return failValidation("items", `${prefix}상태 등급을 입력해주세요.`);
        if (!it.price.trim()) return failValidation("items", `${prefix}가격을 입력해주세요.`);
      }
      if (tradeMethods.size === 0) return failValidation("tradeMethods", "거래 방식을 1개 이상 선택해주세요.");
      if (tradeMethods.has("etc") && !tradeMethodEtc.trim()) return failValidation("tradeMethods", "기타 거래 방식 내용을 입력해주세요.");
    } else {
      if (!industry.trim()) return failValidation("industry", "업종을 선택해주세요.");
      if (!storeType.trim()) return failValidation("storeType", "매장 종류를 입력해주세요.");
      if (centerNameVisible === "public" && !centerNameValue.trim()) return failValidation("centerNameValue", "센터명을 공개로 선택하셨습니다. 이름을 입력해주세요.");
      if (!areaPyeong.trim()) return failValidation("area", "평수를 입력해주세요.");
      if (!deposit.trim()) return failValidation("deposit", "보증금을 입력해주세요.");
      if (!monthly.trim()) return failValidation("monthly", "월세를 입력해주세요.");
      if (memberType === "숫자 입력" && !memberValue.trim()) return failValidation("member", "보유회원수를 입력해주세요.");
      if (memberType === "기타" && !memberEtc.trim()) return failValidation("member", "보유회원수 기타 항목을 입력해주세요.");
    }

    if (!body.trim()) return failValidation("body", tradeCategory === "center" ? "인수 조건 및 상세 내용을 입력해주세요." : "상세 설명을 입력해주세요.");

    if (!agreed) return failValidation(null, "동의 항목을 체크해주세요.");
    return true;
  };

  /* 등록 */
  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const token = await getIdToken();
      const [sido, sigungu] = regionName.split(" ");

      let payload: Record<string, unknown> = {
        category: tradeCategory,
        title: title.trim(),
        body: body.trim(),
        region_sido: sido,
        region_sigungu: sigungu,
        region_detail: regionDetail.trim() || null,
        contact_phone: contactPhone.trim(),
        image_urls: imageUrls,
        agreed_to_terms: true,
      };

      if (tradeCategory === "equipment") {
        const methods: { type: TradeMethodKey; loading?: boolean; text?: string }[] = [];
        for (const m of tradeMethods) {
          if (m === "delivery") methods.push({ type: "delivery", loading: deliveryLoading });
          else if (m === "etc") methods.push({ type: "etc", text: tradeMethodEtc.trim() });
          else methods.push({ type: m });
        }
        const itemList = items.map(it => ({
          name: it.name.trim(),
          condition: it.condition.trim(),
          price_manwon: parseNum(it.price),
        }));
        payload = {
          ...payload,
          product_name: itemList[0].name,
          condition_text: itemList[0].condition,
          price_manwon: itemList[0].price_manwon,
          center_name: centerName.trim(),
          equipment_info: { trade_methods: methods, items: itemList },
        };
      } else {
        const memberCount: Record<string, unknown> =
          memberType === "숫자 입력"
            ? { type: "number", value: parseNum(memberValue) }
            : { type: "etc", text: memberEtc.trim() };

        payload = {
          ...payload,
          center_info: {
            industry,
            store_type: storeType.trim(),
            name_visible: centerNameVisible === "public",
            name: centerNameVisible === "public" ? centerNameValue.trim() : null,
            area_pyeong: parseNum(areaPyeong),
            deposit:  { amount_manwon: parseNum(deposit) },
            monthly:  { amount_manwon: parseNum(monthly) },
            mgmt_fee: { amount_manwon: parseNum(mgmtFee) },
            premium:  premiumNeg === "권리금없음"
              ? { amount_manwon: 0, negotiable: "권리금없음" }
              : { amount_manwon: parseNum(premium), negotiable: premiumNeg },
            member_count: memberCount,
          },
        };
      }

      const res = await fetch(isEdit && editId ? `/api/trade/${editId}` : "/api/trade", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || (isEdit ? "수정에 실패했습니다." : "등록에 실패했습니다.")); setShowConfirm(false); return; }
      router.replace(isEdit && editId ? `/trade/${editId}` : `/trade`);
    } catch {
      setError("오류가 발생했습니다.");
      setShowConfirm(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || (isEdit && !editLoaded)) return (
    <div className="flex justify-center items-center min-h-screen bg-[#F8F4EC] dark:bg-zinc-950">
      <div className="w-7 h-7 border-2 border-[#6B7B3A] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  /* 비로그인 — 구인글과 동일 디자인 */
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
              <h2 className="text-xl font-bold text-[#2A251D] dark:text-zinc-100 mb-2 tracking-tight">로그인하고 거래 글을 등록하세요</h2>
              <p className="text-[13px] text-[#6B5D47] dark:text-zinc-400 mb-6 leading-relaxed">
                로그인하면 작성·수정·관리 등<br />
                거래글을 손쉽게 운영할 수 있어요
              </p>
              <button onClick={signInWithGoogle} className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-[#FEFCF7] dark:bg-zinc-800 border border-[#E8E0D0] dark:border-zinc-600 rounded-2xl text-sm font-semibold text-[#3A342A] dark:text-zinc-200 hover:bg-[#F5F0E5] dark:hover:bg-zinc-700 hover:border-[#6B7B3A]/40 transition-all mb-2">
                <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Google로 로그인
              </button>
              <button onClick={signInWithApple} className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-[#2A251D] text-white rounded-2xl text-sm font-semibold hover:bg-black transition-all">
                <svg className="w-5 h-5" viewBox="0 0 384 512" fill="currentColor"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>
                Apple로 로그인
              </button>
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
      {/* 헤더 */}
      <div className="sticky top-14 z-30 bg-[#F8F4EC]/85 dark:bg-zinc-950/85 backdrop-blur-md border-b border-[#E8E0D0]/70 dark:border-zinc-800">
        <div className="mx-auto max-w-2xl flex items-center gap-2 px-4 sm:px-6 py-3">
          <Link href="/trade" className="inline-flex items-center gap-1.5 -ml-1 px-1 py-0.5 rounded-lg text-[#6B7B3A] hover:bg-[#F5F0E5]/60 dark:hover:bg-zinc-800 transition-colors">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            <span className="text-[11px] font-bold tracking-[0.15em] uppercase">거래 게시판</span>
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-6 space-y-5">
        {/* 인트로 */}
        <section className="relative bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-6 sm:p-8 overflow-hidden shadow-[0_1px_0_rgba(0,0,0,0.02),0_12px_32px_-20px_rgba(107,93,71,0.2)]">
          <div aria-hidden className="absolute -top-20 -right-16 w-56 h-56 rounded-full bg-[#6B7B3A]/[0.06] blur-3xl pointer-events-none" />
          <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/30 to-transparent" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 mb-4">
              <span className="w-6 h-px bg-[#6B7B3A]" />
              <span className="text-[11px] font-bold tracking-[0.15em] text-[#6B7B3A] uppercase">{isEdit ? "Edit Trade" : "New Trade"}</span>
            </div>
            <h1 className="text-[22px] sm:text-[26px] font-bold text-[#2A251D] dark:text-zinc-100 leading-tight tracking-tight mb-2">
              {isEdit ? "거래 글 수정" : "거래 글 등록"}
            </h1>
            <p className="text-[13px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed mb-5 max-w-md">
              {isEdit ? "글 내용을 수정할 수 있어요. 정확한 정보를 입력해주세요." : "운동기구 중고거래나 센터매매 글을 등록할 수 있어요. 정확한 정보를 입력해주세요."}
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

        {/* ─── 카테고리 토글 ─── */}
        <Section number={1} title="거래 종류" subtitle="중고거래 / 센터매매 중 선택하세요">
          <div className="flex gap-1.5">
            {([
              { v: "equipment", label: "중고거래" },
              { v: "center", label: "센터매매" },
            ] as const).map(opt => (
              <button key={opt.v} onClick={() => setTradeCategory(opt.v)}
                className={`flex-1 px-3 py-3 rounded-xl text-[13px] font-semibold transition-all ${
                  tradeCategory === opt.v
                    ? "bg-[#6B7B3A] text-white shadow-[0_2px_8px_-2px_rgba(107,123,58,0.4)]"
                    : "bg-[#FBF7EB] dark:bg-zinc-800 text-[#6B5D47] dark:text-zinc-400 border border-[#E8E0D0] dark:border-zinc-700 hover:border-[#6B7B3A]/40"
                }`}>
                {opt.label}
              </button>
            ))}
          </div>
        </Section>

        {/* ─── 공통: 제목/지역 ─── */}
        <Section number={2} title="기본 정보" subtitle="제목과 지역을 입력하세요">
          <div ref={fieldRefs.title}>
            <Field label="제목" required count={title.length} max={50}>
              <input type="text" value={title} onChange={e => setTitle(e.target.value.slice(0, 50))}
                placeholder={tradeCategory === "equipment" ? "예) 거의 새것 덤벨 세트 1~20kg 일괄 판매" : "예) 강남구 110평 PT샵 매매 / 권리금 협의"}
                className={inputCls} />
            </Field>
          </div>

          <div ref={fieldRefs.region}>
            <Field label="지역 (시·군·구)" required>
              <button onClick={() => { setShowRegion(true); setRegionStep("group"); }}
                className={`w-full flex items-center justify-between px-4 py-3 border rounded-xl text-[14px] text-left transition-colors ${
                  regionName ? "border-[#6B7B3A]/40 bg-[#FBF7EB] dark:bg-zinc-800 text-[#2A251D] dark:text-zinc-100 font-medium"
                  : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB] dark:bg-zinc-800 text-[#A89B80]"
                } hover:border-[#6B7B3A]/50`}>
                <span className="inline-flex items-center gap-2 truncate">
                  <svg className="w-4 h-4 text-[#6B7B3A] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                  {regionName || "지역을 시·군·구까지 선택해 주세요"}
                </span>
                <svg className="w-4 h-4 text-[#A89B80] shrink-0 ml-2" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>
            </Field>
          </div>

          {/* 중고거래 전용 — 센터명 (필수 공개) */}
          {tradeCategory === "equipment" && (
            <div ref={fieldRefs.centerName}>
              <Field label="센터명" required hint="중고거래는 필수 공개" count={centerName.length} max={50}>
                <input type="text" value={centerName} onChange={e => setCenterName(e.target.value.slice(0, 50))}
                  placeholder="제품을 보관·사용 중인 센터명" className={inputCls} />
              </Field>
            </div>
          )}

          {/* 상세 주소 — 중고거래 필수, 센터매매 선택 */}
          <div ref={fieldRefs.regionDetail}>
            <Field
              label="상세 주소"
              required={tradeCategory === "equipment"}
              hint={tradeCategory === "equipment" ? "시·군·구 뒤에 추가 주소 필수 입력" : "선택 — 추가 주소 입력 가능"}
            >
              <input type="text" value={regionDetail} onChange={e => setRegionDetail(e.target.value.slice(0, 100))}
                placeholder={regionName ? `${regionName} 역삼동 OO빌딩 1층 등` : "지역을 먼저 선택해 주세요"}
                className={inputCls}
                disabled={!regionName} />
              {!regionName && <p className="text-[11px] text-[#A89B80] mt-1.5">지역(시·군·구)을 먼저 선택해 주세요.</p>}
              {regionName && <p className="text-[11px] text-[#A89B80] mt-1.5">시·군·구가 자동 입력됩니다. 그 뒤에 추가 주소를 입력해 주세요.</p>}
            </Field>
          </div>
        </Section>

        {/* ─── equipment 전용 ─── */}
        {tradeCategory === "equipment" && (
          <>
            <Section number={3} title="제품 정보" subtitle="판매하려는 제품 정보를 입력하세요 (여러 개 등록 가능)">
              <div ref={fieldRefs.items} className="space-y-4">
                {items.map((item, idx) => (
                  <div key={idx}
                    className={items.length > 1
                      ? "relative p-4 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl bg-[#FBF7EB]/40 dark:bg-zinc-900/40 space-y-4"
                      : "space-y-4"}>
                    {items.length > 1 && (
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#6B7B3A]">
                          <span className="w-5 h-5 rounded-full bg-[#6B7B3A] text-white text-[11px] flex items-center justify-center">{idx + 1}</span>
                          물품 {idx + 1}
                        </span>
                        <button type="button" onClick={() => removeItem(idx)}
                          className="text-[12px] text-[#C0392B] hover:text-[#A93226] font-semibold">
                          삭제
                        </button>
                      </div>
                    )}
                    <Field label="제품명" required count={item.name.length} max={80}>
                      <input type="text" value={item.name}
                        onChange={e => updateItem(idx, "name", e.target.value.slice(0, 80))}
                        placeholder="예) 마이마운틴, 덤벨 1~20kg 일괄" className={inputCls} />
                    </Field>
                    <Field label="상태 등급" required count={item.condition.length} max={50}>
                      <input type="text" value={item.condition}
                        onChange={e => updateItem(idx, "condition", e.target.value.slice(0, 50))}
                        placeholder="예) S급 거의 새 것, A급 사용감 적음" className={inputCls} />
                    </Field>
                    <Field label="가격" required>
                      <div className="flex items-center gap-2">
                        <input type="text" value={item.price}
                          onChange={e => updateItem(idx, "price", formatNumber(e.target.value))}
                          placeholder="가격" className={`${inputCls} flex-1`} inputMode="numeric" />
                        <span className="text-[14px] font-semibold text-[#6B5D47] shrink-0">만원</span>
                      </div>
                    </Field>
                  </div>
                ))}
                {items.length < 10 && (
                  <button type="button" onClick={addItem}
                    className="w-full flex items-center justify-center gap-1.5 py-3 border-2 border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl text-[13px] font-semibold text-[#6B7B3A] hover:border-[#6B7B3A]/50 hover:bg-[#F5F0E5]/40 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    물품 추가
                  </button>
                )}
              </div>
            </Section>

            <Section number={4} title="거래 방식" subtitle="가능한 거래 방식을 모두 선택하세요 (중복 가능)">
              <div ref={fieldRefs.tradeMethods}>
                <Field label="거래 방식" required>
                  <div className="space-y-2">
                    {TRADE_METHODS.map(m => (
                      <button key={m.key} onClick={() => toggleMethod(m.key)}
                        className={`w-full flex items-center gap-3 px-4 py-3 border rounded-xl text-left text-[14px] transition-colors ${
                          tradeMethods.has(m.key)
                            ? "border-[#6B7B3A]/50 bg-[#F5F0E5] dark:bg-zinc-800 text-[#2A251D] dark:text-zinc-100 font-semibold"
                            : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB] dark:bg-zinc-800 text-[#3A342A] dark:text-zinc-200 hover:border-[#6B7B3A]/40"
                        }`}>
                        <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                          tradeMethods.has(m.key)
                            ? "bg-[#6B7B3A] shadow-[0_2px_8px_-2px_rgba(107,123,58,0.4)]"
                            : "border-2 border-[#E8E0D0] dark:border-zinc-700"
                        }`}>
                          {tradeMethods.has(m.key) && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                        </span>
                        <span>{m.label}</span>
                      </button>
                    ))}

                    {tradeMethods.has("delivery") && (
                      <label className="flex items-center gap-2.5 px-4 py-3 ml-1 text-[13px] text-[#6B5D47] dark:text-zinc-400 cursor-pointer">
                        <input type="checkbox" checked={deliveryLoading} onChange={e => setDeliveryLoading(e.target.checked)} className="w-4 h-4 rounded accent-[#6B7B3A]" />
                        용달거래 — 상차 가능
                      </label>
                    )}
                    {tradeMethods.has("etc") && (
                      <input type="text" value={tradeMethodEtc} onChange={e => setTradeMethodEtc(e.target.value.slice(0, 50))}
                        placeholder="기타 거래 방식 입력" className={inputCls} />
                    )}
                  </div>
                </Field>
              </div>
            </Section>
          </>
        )}

        {/* ─── center 전용 ─── */}
        {tradeCategory === "center" && (
          <>
            <Section number={3} title="센터 기본 정보">
              <div ref={fieldRefs.industry}>
                <Field label="업종" required hint="구인 글쓰기와 동일한 종목 분류">
                  <SelectButton value={industry} placeholder="업종을 선택해 주세요" onClick={() => { setShowIndustry(true); setIndustrySearch(""); }} />
                </Field>
              </div>
              <div ref={fieldRefs.storeType}>
                <Field label="매장 종류" required count={storeType.length} max={30}>
                  <input type="text" value={storeType} onChange={e => setStoreType(e.target.value.slice(0, 30))}
                    placeholder="예) 헬스장, PT샵, 크로스핏, 필라테스, 그룹PT 등" className={inputCls} />
                </Field>
              </div>
              <Field label="센터명" required hint="비공개 시 이름 미입력">
                <div className="flex gap-1.5 mb-2">
                  {(["private","public"] as const).map(v => (
                    <button key={v} onClick={() => setCenterNameVisible(v)}
                      className={`flex-1 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all ${
                        centerNameVisible === v
                          ? "bg-[#6B7B3A] text-white shadow-[0_2px_8px_-2px_rgba(107,123,58,0.4)]"
                          : "bg-[#FBF7EB] dark:bg-zinc-800 text-[#6B5D47] dark:text-zinc-400 border border-[#E8E0D0] dark:border-zinc-700 hover:border-[#6B7B3A]/40"
                      }`}>
                      {v === "private" ? "비공개" : "공개"}
                    </button>
                  ))}
                </div>
                {centerNameVisible === "public" && (
                  <div ref={fieldRefs.centerNameValue}>
                    <input type="text" value={centerNameValue} onChange={e => setCenterNameValue(e.target.value.slice(0, 50))}
                      placeholder="센터명 입력 (예: OO피트니스)" className={inputCls} />
                  </div>
                )}
              </Field>
              <div ref={fieldRefs.area}>
                <Field label="평수" required>
                  <div className="flex items-center gap-2">
                    <input type="text" value={areaPyeong} onChange={e => setAreaPyeong(formatNumber(e.target.value))}
                      placeholder="평수" className={`${inputCls} flex-1`} inputMode="numeric" />
                    <span className="text-[14px] font-semibold text-[#6B5D47] shrink-0">평</span>
                  </div>
                </Field>
              </div>
            </Section>

            <Section number={4} title="지출정보" subtitle="보증금·월세·관리비를 입력하세요">
              <div ref={fieldRefs.deposit}>
                <PlainMoneyField label="보증금" required value={deposit} onChange={setDeposit} />
              </div>
              <div ref={fieldRefs.monthly}>
                <PlainMoneyField label="월세" required value={monthly} onChange={setMonthly} />
              </div>
              <PlainMoneyField label="관리비" value={mgmtFee} onChange={setMgmtFee} />
            </Section>

            <Section number={5} title="권리금" subtitle="권리금 여부와 금액을 선택하세요">
              <PremiumField value={premium} onChange={setPremium} neg={premiumNeg} setNeg={setPremiumNeg} />
            </Section>

            <Section number={6} title="보유회원수">
              <div ref={fieldRefs.member}>
                <Field label="보유회원수" required>
                  <div className="flex gap-1.5 mb-2 flex-wrap">
                    {MEMBER_COUNT_TYPES.map(t => (
                      <button key={t} onClick={() => setMemberType(t)}
                        className={`px-3 py-2 rounded-xl text-[12px] font-semibold transition-all ${
                          memberType === t
                            ? "bg-[#6B7B3A] text-white shadow-[0_2px_8px_-2px_rgba(107,123,58,0.4)]"
                            : "bg-[#FBF7EB] dark:bg-zinc-800 text-[#6B5D47] dark:text-zinc-400 border border-[#E8E0D0] dark:border-zinc-700 hover:border-[#6B7B3A]/40"
                        }`}>
                        {t}
                      </button>
                    ))}
                  </div>
                  {memberType === "숫자 입력" && (
                    <div className="flex items-center gap-2">
                      <input type="text" value={memberValue} onChange={e => setMemberValue(formatNumber(e.target.value))}
                        placeholder="회원 수" className={`${inputCls} flex-1`} inputMode="numeric" />
                      <span className="text-[14px] font-semibold text-[#6B5D47] shrink-0">명</span>
                    </div>
                  )}
                  {memberType === "기타" && (
                    <input type="text" value={memberEtc} onChange={e => setMemberEtc(e.target.value.slice(0, 100))}
                      placeholder="예) 정회원 200명 + 휴면 50명, 만나서 알려드림 등" className={inputCls} />
                  )}
                </Field>
              </div>
            </Section>
          </>
        )}

        {/* ─── 사진 (공통) ─── */}
        <Section number={tradeCategory === "equipment" ? 5 : 7} title="사진 등록" subtitle="1~10장 첨부">
          <div ref={fieldRefs.images}>
            <Field label={`사진 ${imageUrls.length}/10`} required>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {imageUrls.map((url, i) => (
                  <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-[#E8E0D0] dark:border-zinc-700">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`사진 ${i + 1}`} className="w-full h-full object-cover" />
                    <button type="button" onClick={() => setImageUrls(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white text-[12px] flex items-center justify-center hover:bg-black/80">
                      ×
                    </button>
                  </div>
                ))}
                {imageUrls.length < 10 && (
                  <label className="aspect-square rounded-xl border-2 border-dashed border-[#E8E0D0] dark:border-zinc-700 flex items-center justify-center text-[#A89B80] hover:border-[#6B7B3A]/50 hover:bg-[#F5F0E5]/40 cursor-pointer transition-colors">
                    {uploading ? (
                      <div className="w-5 h-5 border-2 border-[#6B7B3A] border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-1">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="text-[11px] font-semibold">사진 추가</span>
                      </div>
                    )}
                    <input type="file" accept="image/*" multiple className="hidden"
                      onChange={e => { handleImageUpload(e.target.files); e.currentTarget.value = ""; }} disabled={uploading} />
                  </label>
                )}
              </div>
            </Field>
          </div>
        </Section>

        {/* ─── 연락처 + 상세설명 (공통) ─── */}
        <Section number={tradeCategory === "equipment" ? 6 : 8} title="연락처 & 상세 내용">
          <div ref={fieldRefs.contact}>
            <Field label="연락처" required>
              <input type="tel" value={contactPhone} onChange={e => setContactPhone(formatPhone(e.target.value))}
                placeholder="010-0000-0000" maxLength={13} className={inputCls} />
            </Field>
          </div>
          <div ref={fieldRefs.body}>
            <Field label={tradeCategory === "center" ? "인수 조건 및 상세 내용" : "상세 설명"}
              count={body.length} max={2000}
              required>
              <textarea value={body} onChange={e => setBody(e.target.value.slice(0, 2000))}
                placeholder={tradeCategory === "center"
                  ? "인수 조건, 회원 인계 여부, 시설/기구 인계 범위, 매매 사유 등을 자유롭게 작성하세요."
                  : "기구 상태, 사용 기간, 일괄 구매 할인 등 추가 정보를 자유롭게 작성하세요."}
                rows={6} style={{ minHeight: 160 }} className={`${inputCls} resize-none leading-relaxed`} />
            </Field>
          </div>
        </Section>

        {/* ─── 동의 (공통) ─── */}
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
              작성한 거래 정보는 <span className="font-semibold text-[#3A342A]">사실이며</span>, 허위·사기성 내용에 대한 책임은 작성자 본인에게 있습니다. 모두의 지도사는 거래 당사자가 아니며 거래에 관여하지 않습니다.
            </span>
          </button>
        </section>
      </div>

      {/* 하단 등록 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-[#F8F4EC] via-[#F8F4EC]/95 to-[#F8F4EC]/0 dark:from-zinc-950 dark:via-zinc-950/95 dark:to-zinc-950/0 pt-6 pb-4 z-20 pointer-events-none" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}>
        <div className="mx-auto max-w-2xl px-4 sm:px-6 pointer-events-auto">
          <button
            onClick={() => { if (validate()) { setShowConfirm(true); setConfirmChecked(false); } }}
            disabled={submitting}
            className="w-full py-4 bg-[#6B7B3A] hover:bg-[#5A6930] text-white font-bold text-[15px] rounded-2xl disabled:opacity-50 shadow-[0_12px_32px_-12px_rgba(107,123,58,0.6)] transition-all hover:-translate-y-0.5">
            {submitting ? (isEdit ? "수정 중..." : "등록 중...") : (isEdit ? "거래 글 수정하기" : "거래 글 등록하기")}
          </button>
        </div>
      </div>

      {/* ══════ 모달들 ══════ */}

      {/* 지역 선택 모달 */}
      <Modal open={showRegion} onClose={() => setShowRegion(false)} title={regionStep === "group" ? "지역 선택" : selectedGroup?.name || ""} subtitle="시·도를 선택한 후 시·군·구를 선택하세요">
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
            {selectedGroup?.subRegions.filter(s => s.name !== "전체").map(s => (
              <button key={s.code} onClick={() => handleRegionSelect(s.code, s.name, selectedGroup!.name)}
                className={`w-full text-left px-5 py-4 text-[14px] hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 border-b border-[#E8E0D0]/60 dark:border-zinc-800 last:border-0 transition-colors ${
                  regionCode === s.code ? "text-[#6B7B3A] dark:text-[#A8B87A] font-semibold bg-[#F5F0E5]/50" : "text-[#3A342A] dark:text-zinc-100"
                }`}>
                {s.name}
              </button>
            ))}
          </div>
        )}
      </Modal>

      {/* 업종 선택 모달 (구인글 종목 모달과 동일 패턴) */}
      <Modal open={showIndustry} onClose={() => setShowIndustry(false)} title="업종 선택" subtitle="업종을 검색하거나 선택하세요">
        <div className="px-5 py-3 sticky top-0 bg-[#FEFCF7] dark:bg-zinc-900 z-10 border-b border-[#E8E0D0]/60 dark:border-zinc-800">
          <div className="flex items-center gap-2 px-3.5 py-2.5 border border-[#E8E0D0] dark:border-zinc-700 rounded-xl bg-[#FBF7EB] dark:bg-zinc-800 focus-within:border-[#6B7B3A]/50 focus-within:bg-[#FEFCF7] transition-colors">
            <svg className="w-4 h-4 text-[#A89B80] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={industrySearch} onChange={e => setIndustrySearch(e.target.value)} placeholder="업종 검색 (초성 가능)"
              className="flex-1 text-[13px] bg-transparent text-[#3A342A] dark:text-zinc-100 placeholder-[#A89B80] focus:outline-none" />
          </div>
        </div>
        <div>
          {categories.filter(c => matchSearch(c.name, industrySearch)).map(c => (
            <RadioItem key={c.id} label={`${c.emoji} ${c.name}`} selected={industry === c.name}
              onSelect={() => { setIndustry(c.name); setShowIndustry(false); }} />
          ))}
          {categories.filter(c => matchSearch(c.name, industrySearch)).length === 0 && (
            <p className="text-center text-[13px] text-[#A89B80] py-10">일치하는 업종이 없습니다</p>
          )}
        </div>
      </Modal>

      {/* 등록 전 경고 모달 (구인글과 동일 패턴) */}
      <Modal open={showConfirm} onClose={() => setShowConfirm(false)}
        icon={
          <div className="w-14 h-14 rounded-2xl bg-[#FFF4E5] dark:bg-zinc-800 flex items-center justify-center">
            <svg className="w-7 h-7 text-[#C0392B]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        }
        title={isEdit ? "수정 전 한 번만 확인해 주세요" : "등록 전 한 번만 확인해 주세요"}
        footer={
          <div className="flex gap-2">
            <button onClick={() => setShowConfirm(false)} disabled={submitting} className="flex-1 py-3 border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800 rounded-xl text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5] disabled:opacity-50 transition-colors">취소</button>
            <button onClick={handleSubmit} disabled={!confirmChecked || submitting}
              className={`flex-1 py-3 rounded-xl text-[13px] font-semibold transition-all ${
                confirmChecked && !submitting
                  ? "bg-[#C0392B] text-white hover:bg-[#A93226] shadow-[0_4px_14px_-4px_rgba(192,57,43,0.4)]"
                  : "bg-[#F5F0E5] text-[#A89B80] dark:bg-zinc-700 dark:text-zinc-400 cursor-not-allowed"
              }`}>
              {submitting ? (isEdit ? "수정 중..." : "등록 중...") : (isEdit ? "동의하고 수정" : "동의하고 등록")}
            </button>
          </div>
        }>
        <div className="px-5 py-4 space-y-3">
          <div className="p-4 bg-[#FFF4E5] dark:bg-zinc-800/60 border border-[#F5D9B0]/70 dark:border-zinc-700 rounded-2xl">
            <p className="text-[13px] text-[#3A342A] dark:text-zinc-300 leading-relaxed font-semibold mb-2">
              ⚠️ 허위·사기성 게시물 등록 시 처벌 대상이 됩니다
            </p>
            <ul className="text-[12px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed list-disc pl-4 space-y-1">
              <li>잘못된 정보·허위 매물·사기성 글로 인한 피해 발생 시 작성자에게 <span className="font-semibold text-[#C0392B]">민·형사상 책임</span>이 있습니다.</li>
              <li>모두의 지도사는 거래 당사자가 아니며, 거래에 일체 관여하지 않습니다.</li>
              <li>위반 시 게시글 삭제, 계정 정지 등의 조치가 이루어질 수 있습니다.</li>
            </ul>
          </div>
          {submitting && (
            <UploadProgress phase="saving" uploadPercent={0} savingLabel={isEdit ? "거래 글 수정 중..." : "거래 글 저장 중..."} />
          )}
          <button onClick={() => setConfirmChecked(!confirmChecked)} disabled={submitting} className="w-full flex items-center gap-2.5 pt-1 disabled:opacity-50">
            <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
              confirmChecked
                ? "bg-[#C0392B] shadow-[0_2px_8px_-2px_rgba(192,57,43,0.4)]"
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

/* ──────────────────────────────────────────
   금액 입력 (협의 토글 없음) — 보증금/월세/관리비
   ────────────────────────────────────────── */
function PlainMoneyField({ label, required, value, onChange }: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label} required={required}>
      <div className="flex items-center gap-2">
        <input type="text" value={value} onChange={e => onChange(formatNumber(e.target.value))}
          placeholder="금액" className={`${inputCls} flex-1`} inputMode="numeric" />
        <span className="text-[14px] font-semibold text-[#6B5D47] shrink-0">만원</span>
      </div>
    </Field>
  );
}

/* ──────────────────────────────────────────
   권리금 전용 — [협의가능][조정불가][권리금없음] + 금액
   "권리금없음" 선택 시 금액 입력 숨김
   ────────────────────────────────────────── */
function PremiumField({ value, onChange, neg, setNeg }: {
  value: string;
  onChange: (v: string) => void;
  neg: typeof NEGOTIABLE_OPTIONS[number];
  setNeg: (v: typeof NEGOTIABLE_OPTIONS[number]) => void;
}) {
  const noPremium = neg === "권리금없음";
  return (
    <Field label="권리금">
      <div className="space-y-2">
        <div className="flex gap-1.5">
          {NEGOTIABLE_OPTIONS.map(opt => (
            <button key={opt} onClick={() => setNeg(opt)}
              className={`flex-1 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all ${
                neg === opt
                  ? "bg-[#6B7B3A] text-white shadow-[0_2px_8px_-2px_rgba(107,123,58,0.4)]"
                  : "bg-[#FBF7EB] dark:bg-zinc-800 text-[#6B5D47] dark:text-zinc-400 border border-[#E8E0D0] dark:border-zinc-700 hover:border-[#6B7B3A]/40"
              }`}>
              {opt}
            </button>
          ))}
        </div>
        {!noPremium && (
          <div className="flex items-center gap-2">
            <input type="text" value={value} onChange={e => onChange(formatNumber(e.target.value))}
              placeholder="금액" className={`${inputCls} flex-1`} inputMode="numeric" />
            <span className="text-[14px] font-semibold text-[#6B5D47] shrink-0">만원</span>
          </div>
        )}
      </div>
    </Field>
  );
}
