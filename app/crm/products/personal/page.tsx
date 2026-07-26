"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { CrmModal } from "../../_components/crm-modal";
import { formatWon } from "../../_components/crm-labels";
import { ProductForm } from "../_components/product-form";
import { ProductDetailModal, ProductDetail } from "../_components/product-detail-modal";
import { ProductEditModal } from "../_components/product-edit-modal";

/**
 * /crm/products/personal — 강사 개인 상품(수강권) 관리
 * 센터 공용 상품과 별개로 강사가 개인 고객(센터 미가입 회원 등)에게 판매할 수강권을 관리합니다.
 * 조회/생성/수정/삭제 모두 로그인 강사 본인 상품만 대상.
 */

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
  session_minutes?: number;
  service_days?: number;
  status?: string;
}

const TYPE_LABEL: Record<string, string> = {
  personal: "개인 레슨",
  group: "그룹 수업",
};

const TYPE_BADGE: Record<string, string> = {
  personal:
    "bg-[#8B6BAA]/15 text-[#7A5C99] dark:bg-[#8B6BAA]/25 dark:text-[#BFA3D6] border border-[#8B6BAA]/30",
  group:
    "bg-[#D17B5A]/15 text-[#B66442] dark:bg-[#D17B5A]/25 dark:text-[#E9A685] border border-[#D17B5A]/30",
};

export default function CrmPersonalProductsPage() {
  const { getIdToken } = useAuth();
  const [list, setList] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [detailProduct, setDetailProduct] = useState<ProductDetail | null>(null);
  const [editProduct, setEditProduct] = useState<ProductDetail | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch("/api/crm/products?scope=personal", {
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
  }, [getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

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
    } else {
      const d = await res.json().catch(() => ({}));
      alert(d?.error || "삭제 실패");
    }
  };

  return (
    <div className="px-5 md:px-8 pt-3 pb-8 max-w-5xl mx-auto">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
            개인 상품 관리
          </h1>
          <p className="mt-1 text-[12.5px] text-[#8C8270] dark:text-zinc-500">
            센터 공용 상품과 별개로, 개인 고객에게 판매할 수강권을 등록·관리해요.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpenNew(true)}
          className="px-4 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932]"
        >
          + 상품 추가
        </button>
      </header>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#E8E0D0] dark:border-zinc-700 bg-white/60 dark:bg-zinc-900/40 py-16 text-center">
          <div className="text-[14px] font-medium text-[#3A342A] dark:text-zinc-200">
            등록된 개인 상품이 없어요
          </div>
          <div className="mt-1 text-[12.5px] text-[#8C8270] dark:text-zinc-500">
            우측 상단 &quot;+ 상품 추가&quot; 로 개인 수강권 상품을 만들어 보세요.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {list.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={detailLoadingId === p.id}
              onClick={() => openDetail(p)}
              className="text-left rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3.5 hover:border-[#6B7B3A]/50 hover:shadow-sm transition-all disabled:opacity-60"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold ${
                    TYPE_BADGE[p.type] ?? "bg-[#F5F0E5] text-[#6B5D47] border border-[#E8E0D0]"
                  }`}
                >
                  {TYPE_LABEL[p.type] ?? p.type}
                </span>
                <span className="text-[10.5px] text-[#A89B80] dark:text-zinc-500">
                  {p.billing_mode === "period" ? "기간제" : "횟수제"}
                </span>
              </div>
              <div className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100 truncate">
                {p.name}
              </div>
              <div className="mt-1 text-[12px] text-[#6B5D47] dark:text-zinc-400">
                {p.billing_mode === "period"
                  ? `${p.duration_value ?? 0}${unitKo(p.duration_unit)}`
                  : `${p.total_sessions ?? 0}회`}
                {p.session_minutes ? ` · ${p.session_minutes}분` : ""}
              </div>
              <div className="mt-2 text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 tabular-nums">
                {formatWon(p.price_won)}원
              </div>
            </button>
          ))}
        </div>
      )}

      {openNew && (
        <CrmModal open onClose={() => setOpenNew(false)} title="개인 상품 추가" size="lg">
          <ProductForm
            mode="create"
            scope="personal"
            initial={{ type: "personal" }}
            onSaved={() => {
              setOpenNew(false);
              load();
            }}
            onCancel={() => setOpenNew(false)}
          />
        </CrmModal>
      )}

      {detailProduct && (
        <ProductDetailModal
          product={detailProduct}
          typeLabel={TYPE_LABEL[detailProduct.type] ?? detailProduct.type}
          onClose={() => setDetailProduct(null)}
          onEdit={() => {
            setEditProduct(detailProduct);
            setDetailProduct(null);
          }}
          onDelete={() => remove(detailProduct.id)}
        />
      )}

      {editProduct && (
        <ProductEditModal
          product={editProduct}
          onClose={() => setEditProduct(null)}
          onSaved={() => {
            setEditProduct(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function unitKo(u: string | null): string {
  if (u === "month") return "개월";
  if (u === "year") return "년";
  return "일";
}
