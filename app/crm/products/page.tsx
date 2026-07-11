"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/auth-provider";
import { crmInputClass, CrmModal } from "../_components/crm-modal";
import { formatWon } from "../_components/crm-labels";
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
  capacity: number;
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

  const typeLabelOf = (key: string): string =>
    BUILT_IN_TYPE_LABEL[key] ?? customTypes.find((t) => t.key === key)?.label ?? key;
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

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-6xl mx-auto">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
            상품
          </h1>
          <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
            센터에서 판매하는 상품(회원권/수업/락커/용품)을 등록해요. 상품을 눌러 상세를 확인하세요.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setTypeManagerOpen(true)}
            className="px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13px] font-medium text-[#3A342A] dark:text-zinc-200 hover:bg-[#F5F0E5] whitespace-nowrap"
          >
            유형 관리
          </button>
          <Link
            href={type ? `/crm/products/new?type=${type}` : "/crm/products/new"}
            className="px-3 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932] whitespace-nowrap"
          >
            + 상품 추가
          </Link>
        </div>
      </header>

      {/* 유형 필터 */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {["", "membership", "group", "personal", "locker", "apparel", "goods", ...customTypes.map((t) => t.key)].map((t) => (
          <button
            key={t || "all"}
            onClick={() => setType(t)}
            className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium border whitespace-nowrap
              ${type === t
                ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
                : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300 hover:border-[#6B7B3A]/40"
              }`}
          >
            {t ? typeLabelOf(t) : "전체"}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="상품명 검색"
        className={`${crmInputClass} mb-4`}
      />

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <Msg>불러오는 중…</Msg>
      ) : list.length === 0 ? (
        <Msg>
          {type || query
            ? "일치하는 상품이 없어요."
            : '등록된 상품이 없어요. "+ 상품 추가"로 첫 상품을 만들어 보세요.'}
        </Msg>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {list.map((p) => (
            <li
              key={p.id}
              onClick={() => openDetail(p)}
              className={`px-4 py-4 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 cursor-pointer hover:border-[#6B7B3A]/50 transition-colors ${
                detailLoadingId === p.id ? "opacity-70" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${typeBadgeClsOf(p.type)}`}
                  >
                    {typeLabelOf(p.type)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      const token = await getIdToken();
                      const res = await fetch(`/api/crm/products/${p.id}`, {
                        headers: { authorization: `Bearer ${token}` },
                        cache: "no-store",
                      });
                      const data = await res.json();
                      if (res.ok) setEditProduct(data.product as ProductDetail);
                    }}
                    className="text-[11px] text-[#6B7B3A] dark:text-[#A8B87A] hover:underline"
                  >
                    수정
                  </button>
                  <span className="text-[11px] text-[#E8E0D0] dark:text-zinc-700">|</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(p.id);
                    }}
                    className="text-[11px] text-red-600 hover:underline"
                  >
                    삭제
                  </button>
                </div>
              </div>
              <div className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 mb-2">
                {p.name}
              </div>
              <div className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
                {p.billing_mode === "period"
                  ? `기간제 · ${p.duration_value}${unitKo(p.duration_unit)}`
                  : `횟수제 · ${p.total_sessions ?? 0}회`}
                {p.type === "group" && p.capacity > 0 && (
                  <span className="ml-1.5 text-[#8C8270]">· 정원 {p.capacity}명</span>
                )}
              </div>
              <div className="mt-1.5 text-[16px] font-bold text-[#6B7B3A] dark:text-[#A8B87A]">
                {formatWon(p.price_won)}원
              </div>
            </li>
          ))}
        </ul>
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

  const saveEdit = async (id: number) => {
    const label = editLabel.trim();
    if (!label) return;
    setBusy(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/product-types/${id}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "수정 실패");
      setEditingId(null);
      setEditLabel("");
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setBusy(false);
    }
  };

  const deleteType = async (id: number) => {
    if (!window.confirm("이 유형을 삭제할까요? 이 유형을 사용 중인 상품이 있으면 삭제되지 않아요.")) return;
    setBusy(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/product-types/${id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "삭제 실패");
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
          기본 6개 유형(회원권/그룹/개인/락커/운동복/용품) 외에 센터에서 직접 만든 커스텀 유형을 여기서 이름 변경 · 삭제할 수 있어요.
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

        {/* 기존 리스트 */}
        {types.length === 0 ? (
          <div className="px-4 py-6 text-center text-[12.5px] text-[#8C8270] border border-dashed border-[#E8E0D0] rounded-xl">
            아직 커스텀 유형이 없어요.
          </div>
        ) : (
          <ul className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 divide-y divide-[#E8E0D0]/70 dark:divide-zinc-800 overflow-hidden">
            {types.map((t) => (
              <li key={t.id} className="px-4 py-2.5 flex items-center gap-2 bg-[#FEFCF7] dark:bg-zinc-900">
                {editingId === t.id ? (
                  <>
                    <input
                      autoFocus
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value.slice(0, 20))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          saveEdit(t.id);
                        }
                        if (e.key === "Escape") {
                          setEditingId(null);
                          setEditLabel("");
                        }
                      }}
                      maxLength={20}
                      className={`${crmInputClass} flex-1`}
                    />
                    <button
                      type="button"
                      onClick={() => saveEdit(t.id)}
                      disabled={busy}
                      className="px-3 py-1.5 rounded-full text-[12px] font-semibold bg-[#6B7B3A] text-white hover:bg-[#5a6932] disabled:opacity-60"
                    >
                      저장
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setEditLabel("");
                      }}
                      className="px-2 py-1.5 text-[12px] text-[#6B5D47] hover:text-[#3A342A]"
                    >
                      취소
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-[14px] font-medium text-[#2A251D] dark:text-zinc-100">
                      {t.label}
                    </span>
                    <span className="text-[10.5px] text-[#A89B80]">{t.key}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(t.id);
                        setEditLabel(t.label);
                      }}
                      className="text-[12px] text-[#6B7B3A] dark:text-[#A8B87A] hover:underline"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteType(t.id)}
                      className="text-[12px] text-red-600 hover:underline"
                    >
                      삭제
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

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
