"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/auth-provider";
import { crmInputClass, CrmModal } from "../_components/crm-modal";
import { formatWon } from "../_components/crm-labels";
import { unitToDays } from "@/app/lib/duration-convert";
import { ProductDetailModal, ProductDetail } from "./_components/product-detail-modal";
import { ProductEditModal } from "./_components/product-edit-modal";

const BUILT_IN_TYPE_LABEL: Record<string, string> = {
  membership: "회원권",
  group: "그룹 수업",
  personal: "개인 레슨",
  locker: "락커",
  apparel: "운동복",
  goods: "운동 용품",
};

const BUILT_IN_KEYS = ["membership", "group", "personal", "locker", "apparel", "goods"];

/** 상품 유형별 배지 색상 — 기본 6종 */
const BUILT_IN_BADGE: Record<string, string> = {
  membership:
    "bg-[#6B7B3A]/15 text-[#6B7B3A] dark:bg-[#6B7B3A]/25 dark:text-[#A8B87A] border border-[#6B7B3A]/30",
  group:
    "bg-[#D17B5A]/15 text-[#B66442] dark:bg-[#D17B5A]/25 dark:text-[#E9A685] border border-[#D17B5A]/30",
  personal:
    "bg-[#8B6BAA]/15 text-[#7A5C99] dark:bg-[#8B6BAA]/25 dark:text-[#BFA3D6] border border-[#8B6BAA]/30",
  locker:
    "bg-[#5A8BB0]/15 text-[#487596] dark:bg-[#5A8BB0]/25 dark:text-[#8FB7D4] border border-[#5A8BB0]/30",
  apparel:
    "bg-[#C76C8E]/15 text-[#A8557A] dark:bg-[#C76C8E]/25 dark:text-[#E2A0BA] border border-[#C76C8E]/30",
  goods:
    "bg-[#A68654]/15 text-[#8B6F42] dark:bg-[#A68654]/25 dark:text-[#D4B584] border border-[#A68654]/30",
};

const CUSTOM_BADGE =
  "bg-[#6B5D47]/10 text-[#6B5D47] dark:bg-zinc-700 dark:text-zinc-300 border border-[#6B5D47]/30";

interface Product {
  id: number;
  type: string;
  billing_mode: "period" | "count";
  category: string | null;
  name: string;
  duration_value: number | null;
  duration_unit: string | null;
  total_sessions: number | null;
  price_won: number;
  vat_included?: boolean;
  mileage_earn?: number;
  pause_enabled?: boolean;
  capacity: number;
  session_minutes?: number;
  service_days?: number | null;
  status?: string;
  created_at?: string;
  updated_at?: string;
  components?: unknown[] | null;
}

interface CustomType {
  id: number;
  key: string;
  label: string;
}

export default function CrmProductsPage() {
  const { getIdToken } = useAuth();
  const [list, setList] = useState<Product[]>([]);
  const [customTypes, setCustomTypes] = useState<CustomType[]>([]);
  const [type, setType] = useState<string>("");
  const [query, setQuery] = useState("");
  const [metricFilter, setMetricFilter] = useState<"all" | "period" | "lesson">("all");
  const [sortBy, setSortBy] = useState<"created" | "updated" | "name">("created");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 상세/수정 모달
  const [detailProduct, setDetailProduct] = useState<ProductDetail | null>(null);
  const [editProduct, setEditProduct] = useState<ProductDetail | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);
  const [typeManagerOpen, setTypeManagerOpen] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const params = new URLSearchParams();
      if (type) params.set("type", type);
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/crm/products?${params}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setList(data.products ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, type, query]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const loadTypes = useCallback(async () => {
    const token = await getIdToken();
    if (!token) return;
    const res = await fetch("/api/crm/product-types", {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      setCustomTypes(data.types ?? []);
    }
  }, [getIdToken]);

  useEffect(() => {
    loadTypes();
  }, [loadTypes]);

  // customTypes 에는 기본 유형 오버라이드 + 순수 커스텀 유형 둘 다 포함됨
  const typeLabelOf = (key: string): string => {
    const override = customTypes.find((t) => t.key === key);
    if (override) return override.label;
    return BUILT_IN_TYPE_LABEL[key] ?? key;
  };
  const typeBadgeClsOf = (key: string): string =>
    BUILT_IN_BADGE[key] ?? CUSTOM_BADGE;

  const remove = async (id: number) => {
    if (!window.confirm("이 상품을 삭제할까요?")) return;
    const token = await getIdToken();
    const res = await fetch(`/api/crm/products/${id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setDetailProduct(null);
      setEditProduct(null);
      load();
    }
  };

  const openDetail = async (p: Product) => {
    setDetailLoadingId(p.id);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/products/${p.id}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setDetailProduct(data.product as ProductDetail);
    } catch (e) {
      alert(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setDetailLoadingId(null);
    }
  };

  const typeKeys = [
    "",
    ...BUILT_IN_KEYS,
    ...customTypes.filter((t) => !BUILT_IN_KEYS.includes(t.key)).map((t) => t.key),
  ];
  const periodCount = list.filter((p) => p.billing_mode === "period").length;
  const lessonCount = list.filter((p) => p.type === "group" || p.type === "personal").length;
  // 지표 카드 클릭 필터 (서버 필터 결과 list 위에 클라이언트 세부 필터)
  const shown = list
    .filter((p) =>
      metricFilter === "period"
        ? p.billing_mode === "period"
        : metricFilter === "lesson"
        ? p.type === "group" || p.type === "personal"
        : true
    )
    // 정렬: 이름순(가나다 오름) / 생성순·수정순(최신 먼저)
    .slice()
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name, "ko");
      const key = sortBy === "updated" ? "updated_at" : "created_at";
      return String(b[key] ?? "").localeCompare(String(a[key] ?? ""));
    });

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-7xl mx-auto">
      <header className="mb-4 rounded-2xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 px-4 py-4 md:px-5 md:py-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold text-[#7F6F55] dark:text-zinc-500">CRM</p>
            <h1 className="mt-1 text-[24px] md:text-[28px] leading-tight font-bold text-[#241F18] dark:text-zinc-100">
              상품 관리
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setTypeManagerOpen(true)}
              className="px-3 py-2 rounded-lg border border-[#D9CDB8] dark:border-zinc-700 bg-white/80 dark:bg-zinc-950 text-[13px] font-semibold text-[#3A342A] dark:text-zinc-200 hover:bg-[#F6F1E8] whitespace-nowrap"
            >
              유형 관리
            </button>
            <Link
              href={type ? `/crm/products/new?type=${type}` : "/crm/products/new"}
              className="px-3 py-2 rounded-lg bg-[#2F3A2B] text-white text-[13px] font-semibold hover:bg-[#20291E] whitespace-nowrap"
            >
              + 상품 추가
            </Link>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 lg:grid-cols-3 gap-2">
          <ProductMetric
            label="등록 상품"
            value={`${list.length}개`}
            hint={type ? typeLabelOf(type) : "전체 유형"}
            active={metricFilter === "all"}
            onClick={() => setMetricFilter("all")}
          />
          <ProductMetric
            label="기간제"
            value={`${periodCount}개`}
            hint={`횟수제 ${Math.max(0, list.length - periodCount)}개`}
            tone="green"
            active={metricFilter === "period"}
            onClick={() => setMetricFilter((f) => (f === "period" ? "all" : "period"))}
          />
          <ProductMetric
            label="수업 상품"
            value={`${lessonCount}개`}
            hint="그룹·개인 레슨"
            tone="blue"
            active={metricFilter === "lesson"}
            onClick={() => setMetricFilter((f) => (f === "lesson" ? "all" : "lesson"))}
          />
        </div>
      </header>

      <section className="mb-4 rounded-2xl border border-[#E4D9C6] dark:border-zinc-800 bg-[#FFFEFB] dark:bg-zinc-900 px-3 py-3 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-[#A89B80]">
              ⌕
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="상품명 검색"
              className={`${crmInputClass} pl-8 h-10 mb-0 bg-white dark:bg-zinc-950`}
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto category-scroll pb-0.5 lg:pb-0">
            {typeKeys.map((t) => (
              <button
                key={t || "all"}
                onClick={() => setType(t)}
                className={`px-3 py-2 rounded-lg text-[12.5px] font-semibold border whitespace-nowrap transition-colors
                  ${type === t
                    ? "border-[#2F3A2B] bg-[#2F3A2B] text-white dark:border-[#A8B87A] dark:bg-[#A8B87A] dark:text-zinc-950"
                    : "border-transparent bg-transparent text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F6F1E8] dark:hover:bg-zinc-800"
                  }`}
              >
                {t ? typeLabelOf(t) : "전체"}
              </button>
            ))}
          </div>
          {/* 정렬 순서 */}
          <div className="flex items-center gap-1.5 pt-0.5">
            <span className="text-[11.5px] text-[#A89B80] mr-0.5">정렬</span>
            {([
              { key: "name", label: "이름순" },
              { key: "created", label: "생성순" },
              { key: "updated", label: "수정순" },
            ] as const).map((s) => (
              <button
                key={s.key}
                onClick={() => setSortBy(s.key)}
                className={`px-2.5 py-1.5 rounded-lg text-[12px] font-medium border whitespace-nowrap transition-colors
                  ${sortBy === s.key
                    ? "border-[#6B7B3A] bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A]"
                    : "border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F6F1E8] dark:hover:bg-zinc-800"
                  }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <Msg>불러오는 중…</Msg>
      ) : shown.length === 0 ? (
        <Msg>
          {metricFilter !== "all"
            ? `${metricFilter === "period" ? "기간제" : "수업"} 상품이 없어요.`
            : type || query
            ? "일치하는 상품이 없어요."
            : '등록된 상품이 없어요. "+ 상품 추가"로 첫 상품을 만들어 보세요.'}
        </Msg>
      ) : (
        <section>
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {shown.map((p) => (
              <li key={p.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openDetail(p)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openDetail(p);
                    }
                  }}
                  className={`h-full rounded-2xl border border-[#E4D9C6] dark:border-zinc-800 bg-white/80 dark:bg-zinc-900 px-4 py-4 shadow-sm hover:border-[#AFA083] hover:bg-[#FFFCF5] dark:hover:bg-zinc-800/70 transition-colors ${
                    detailLoadingId === p.id ? "opacity-70" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="mt-0.5 w-1.5 h-9 rounded-full bg-[#2F3A2B] dark:bg-[#A8B87A] shrink-0" />
                      <div className="min-w-0">
                        <div className="truncate text-[15px] font-bold text-[#241F18] dark:text-zinc-100">
                          {p.name}
                        </div>
                        {p.category && (
                          <div className="mt-0.5 text-[12px] text-[#8C8270] dark:text-zinc-500 truncate">
                            {p.category}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[16px] font-bold text-[#2F3A2B] dark:text-[#A8B87A]">
                        {formatWon(p.price_won)}원
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#A89B80] dark:text-zinc-500">
                        {p.vat_included ? "VAT 포함" : "VAT 별도"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-bold ${typeBadgeClsOf(p.type)}`}
                    >
                      {typeLabelOf(p.type)}
                    </span>
                    <span className="inline-flex items-center px-2 py-1 rounded-md border border-[#E8E0D0] dark:border-zinc-700 text-[11px] font-semibold text-[#6B5D47] dark:text-zinc-400">
                      {p.billing_mode === "period" ? "기간제" : "횟수제"}
                    </span>
                    {Array.isArray(p.components) && p.components.length > 0 && (
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-bold border border-[#B47B2A]/30 bg-[#B47B2A]/12 text-[#B47B2A] dark:bg-amber-900/30 dark:text-amber-300">
                        🎁 묶음 상품
                      </span>
                    )}
                  </div>

                  <div className="mt-3 rounded-xl bg-[#F8F4EC] dark:bg-zinc-950/50 px-3 py-2 text-[13px] text-[#3A342A] dark:text-zinc-200">
                    <div className="font-bold">{productTerm(p)}</div>
                    <div className="mt-0.5 text-[12px] leading-relaxed text-[#8C8270] dark:text-zinc-500">
                      {productSubMeta(p)}
                    </div>
                  </div>

                  <div className="mt-3 flex justify-end items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={async () => {
                        const token = await getIdToken();
                        const res = await fetch(`/api/crm/products/${p.id}`, {
                          headers: { authorization: `Bearer ${token}` },
                          cache: "no-store",
                        });
                        const data = await res.json();
                        if (res.ok) setEditProduct(data.product as ProductDetail);
                      }}
                      className="px-2.5 py-1.5 rounded-md border border-[#D9CDB8] dark:border-zinc-700 text-[12px] font-semibold text-[#3A342A] dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-950"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(p.id)}
                      className="px-2.5 py-1.5 rounded-md border border-red-300 dark:border-red-800/60 text-[12px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 상세 모달 (읽기 전용) */}
      <ProductDetailModal
        product={detailProduct}
        typeLabel={detailProduct ? typeLabelOf(detailProduct.type) : undefined}
        onClose={() => setDetailProduct(null)}
        onEdit={() => {
          if (detailProduct) {
            setEditProduct(detailProduct);
            setDetailProduct(null);
          }
        }}
        onDelete={() => detailProduct && remove(detailProduct.id)}
      />

      {/* 수정 모달 */}
      <ProductEditModal
        product={editProduct}
        onClose={() => setEditProduct(null)}
        onSaved={() => {
          setEditProduct(null);
          load();
        }}
      />

      {/* 상품 유형 관리 모달 */}
      <TypeManagerModal
        open={typeManagerOpen}
        onClose={() => setTypeManagerOpen(false)}
        types={customTypes}
        reload={loadTypes}
      />
    </div>
  );
}

interface DisplayRow {
  key: string;
  label: string;
  dbId: number | null;
  isBuiltin: boolean;
}

function ProductMetric({
  label,
  value,
  hint,
  tone = "default",
  onClick,
  active = false,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "green" | "blue" | "gold";
  onClick?: () => void;
  active?: boolean;
}) {
  const toneClass =
    tone === "green"
      ? "text-[#2F6F54] dark:text-emerald-300"
      : tone === "blue"
      ? "text-[#315F7D] dark:text-sky-300"
      : tone === "gold"
      ? "text-[#8A641D] dark:text-amber-300"
      : "text-[#241F18] dark:text-zinc-100";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border px-3 py-2.5 min-w-0 transition-colors ${
        active
          ? "border-[#6B7B3A] bg-[#6B7B3A]/8 ring-1 ring-[#6B7B3A]/40"
          : "border-[#E8E0D0]/80 dark:border-zinc-800 bg-[#FFFEFB] dark:bg-zinc-950/40 hover:border-[#6B7B3A]/50"
      }`}
    >
      <div className="text-[11px] font-semibold text-[#8C8270] dark:text-zinc-500">{label}</div>
      <div className={`mt-1 text-[16px] md:text-[17px] font-bold truncate ${toneClass}`}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-[#A89B80] dark:text-zinc-500 truncate">{hint}</div>
    </button>
  );
}

function productTerm(p: Product): string {
  if (p.billing_mode === "period") {
    const value = p.duration_value && p.duration_value > 0 ? p.duration_value : null;
    return value ? `${value}${unitKo(p.duration_unit)}` : "기간 무제한";
  }
  return `${p.total_sessions ?? 0}회`;
}

function productSubMeta(p: Product): string {
  const parts: string[] = [];
  if (p.type === "group" && p.capacity > 0) parts.push(`정원 ${p.capacity}명`);
  if ((p.type === "group" || p.type === "personal") && p.session_minutes) {
    parts.push(`${p.session_minutes}분 수업`);
  }
  // 횟수제 수강권: 유효기간(일) 표시 (service_days 우선, 없으면 duration 환산)
  if ((p.type === "group" || p.type === "personal") && p.billing_mode === "count") {
    const vd =
      p.service_days && p.service_days > 0
        ? p.service_days
        : unitToDays(p.duration_value, p.duration_unit);
    parts.push(vd > 0 ? `유효기간 ${vd.toLocaleString()}일` : "유효기간 무제한");
  }
  if (p.pause_enabled) parts.push("정지 가능");
  if (p.mileage_earn && p.mileage_earn > 0) parts.push(`${p.mileage_earn.toLocaleString()}P 적립`);
  return parts.length > 0 ? parts.join(" · ") : "추가 조건 없음";
}

function TypeManagerModal({
  open,
  onClose,
  types,
  reload,
}: {
  open: boolean;
  onClose: () => void;
  types: CustomType[];
  reload: () => void;
}) {
  const { getIdToken } = useAuth();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // 기본 6종 + 커스텀 유형 병합
  const rows: DisplayRow[] = [
    ...BUILT_IN_KEYS.map((k) => {
      const override = types.find((t) => t.key === k);
      return {
        key: k,
        label: override?.label ?? BUILT_IN_TYPE_LABEL[k] ?? k,
        dbId: override?.id ?? null,
        isBuiltin: true,
      };
    }),
    ...types
      .filter((t) => !BUILT_IN_KEYS.includes(t.key))
      .map((t) => ({ key: t.key, label: t.label, dbId: t.id, isBuiltin: false })),
  ];

  const addType = async () => {
    const label = newLabel.trim();
    if (!label) return;
    setBusy(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/product-types", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "추가 실패");
      setNewLabel("");
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (row: DisplayRow) => {
    const label = editLabel.trim();
    if (!label) return;
    if (label === row.label) {
      setEditingKey(null);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const token = await getIdToken();
      let res: Response;
      if (row.dbId) {
        // 기존 row (기본 오버라이드 or 커스텀) → PATCH
        res = await fetch(`/api/crm/product-types/${row.dbId}`, {
          method: "PATCH",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ label }),
        });
      } else {
        // 기본 유형 첫 오버라이드 → POST(key 포함)
        res = await fetch("/api/crm/product-types", {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ label, key: row.key }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "수정 실패");
      setEditingKey(null);
      setEditLabel("");
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setBusy(false);
    }
  };

  const deleteType = async (row: DisplayRow) => {
    if (!row.dbId) return; // 아무것도 안 함
    if (row.isBuiltin) {
      if (!window.confirm(`"${row.label}" → 기본 이름 "${BUILT_IN_TYPE_LABEL[row.key]}" 로 복원할까요?`)) return;
    } else {
      if (!window.confirm("이 유형을 삭제할까요? 이 유형을 사용 중인 상품이 있으면 삭제되지 않아요.")) return;
    }
    setBusy(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/product-types/${row.dbId}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "실패");
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  return (
    <CrmModal open={open} onClose={onClose} title="상품 유형 관리" size="md">
      <div className="space-y-4">
        <p className="text-[12.5px] text-[#8C8270]">
          기본 6종 유형은 이름만 변경할 수 있어요(복원 가능). 새로 만든 커스텀 유형은 이름 변경·삭제 모두 가능해요.
        </p>

        {/* 신규 추가 */}
        <div className="rounded-2xl border border-dashed border-[#6B7B3A]/40 bg-[#6B7B3A]/5 px-3 py-2.5 flex items-center gap-2">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value.slice(0, 20))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addType();
              }
            }}
            placeholder="새 유형 이름 (예: 사우나)"
            maxLength={20}
            className="flex-1 bg-transparent border-0 outline-none text-[13.5px] text-[#2A251D] dark:text-zinc-100 placeholder:text-[#A89B80]"
          />
          <button
            type="button"
            onClick={addType}
            disabled={busy || !newLabel.trim()}
            className="px-3 py-1.5 rounded-full text-[12.5px] font-semibold bg-[#6B7B3A] text-white hover:bg-[#5a6932] disabled:opacity-60"
          >
            추가
          </button>
        </div>

        {/* 리스트: 기본 6종 + 커스텀 */}
        <ul className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 divide-y divide-[#E8E0D0]/70 dark:divide-zinc-800 overflow-hidden">
          {rows.map((row) => (
            <li
              key={row.key}
              className="px-4 py-2.5 flex items-center gap-2 bg-[#FEFCF7] dark:bg-zinc-900"
            >
              {editingKey === row.key ? (
                <>
                  <input
                    autoFocus
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value.slice(0, 20))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        saveEdit(row);
                      }
                      if (e.key === "Escape") {
                        setEditingKey(null);
                        setEditLabel("");
                      }
                    }}
                    maxLength={20}
                    className={`${crmInputClass} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => saveEdit(row)}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-full text-[12px] font-semibold bg-[#6B7B3A] text-white hover:bg-[#5a6932] disabled:opacity-60"
                  >
                    저장
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingKey(null);
                      setEditLabel("");
                    }}
                    className="px-2 py-1.5 text-[12px] text-[#6B5D47] hover:text-[#3A342A]"
                  >
                    취소
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-[14px] font-medium text-[#2A251D] dark:text-zinc-100 flex items-center gap-2">
                    {row.label}
                    {row.isBuiltin && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#6B7B3A]/10 text-[#6B7B3A] dark:bg-[#6B7B3A]/25 dark:text-[#A8B87A]">
                        기본
                      </span>
                    )}
                  </span>
                  <span className="text-[10.5px] text-[#A89B80]">{row.key}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingKey(row.key);
                      setEditLabel(row.label);
                    }}
                    className="px-2 py-0.5 rounded-md border border-[#D9CDB8] dark:border-zinc-700 text-[12px] text-[#6B7B3A] dark:text-[#A8B87A] hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
                  >
                    수정
                  </button>
                  {row.dbId && (
                    <button
                      type="button"
                      onClick={() => deleteType(row)}
                      className="px-2 py-0.5 rounded-md border border-red-300 dark:border-red-800/60 text-[12px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      {row.isBuiltin ? "복원" : "삭제"}
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
      </div>
    </CrmModal>
  );
}

function unitKo(u: string | null): string {
  if (u === "month") return "개월";
  if (u === "day") return "일";
  if (u === "year") return "년";
  return "";
}

function Msg({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-10 text-center text-[13px] text-[#8C8270] border border-dashed border-[#E8E0D0] rounded-xl">
      {children}
    </div>
  );
}
