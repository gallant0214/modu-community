"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/auth-provider";
import { crmInputClass } from "../_components/crm-modal";
import { formatWon } from "../_components/crm-labels";

type ProductType = "membership" | "group" | "personal" | "locker" | "apparel" | "goods";

const TYPE_LABEL: Record<ProductType, string> = {
  membership: "회원권",
  group: "그룹 수업",
  personal: "개인 레슨",
  locker: "락커",
  apparel: "운동복",
  goods: "운동 용품",
};

interface Product {
  id: number;
  type: ProductType;
  billing_mode: "period" | "count";
  category: string | null;
  name: string;
  duration_value: number | null;
  duration_unit: string | null;
  total_sessions: number | null;
  price_won: number;
  capacity: number;
}

export default function CrmProductsPage() {
  const { getIdToken } = useAuth();
  const [list, setList] = useState<Product[]>([]);
  const [type, setType] = useState<"" | ProductType>("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const remove = async (id: number) => {
    if (!window.confirm("이 상품을 삭제할까요?")) return;
    const token = await getIdToken();
    const res = await fetch(`/api/crm/products/${id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.ok) load();
  };

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-6xl mx-auto">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
            상품
          </h1>
          <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
            센터에서 판매하는 상품(회원권/수업/락커/용품)을 등록해요.
          </p>
        </div>
        <Link
          href={type ? `/crm/products/new?type=${type}` : "/crm/products/new"}
          className="px-3 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932] whitespace-nowrap"
        >
          + 상품 추가
        </Link>
      </header>

      {/* 유형 필터 */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {(["", "membership", "group", "personal", "locker", "apparel", "goods"] as const).map((t) => (
          <button
            key={t || "all"}
            onClick={() => setType(t as typeof type)}
            className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium border whitespace-nowrap
              ${type === t
                ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
                : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300 hover:border-[#6B7B3A]/40"
              }`}
          >
            {t ? TYPE_LABEL[t as ProductType] : "전체"}
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
              className="px-4 py-4 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900"
            >
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="text-[11px] text-[#A89B80] font-semibold">
                  {TYPE_LABEL[p.type]}
                  {p.category && <span className="ml-1.5 text-[#8C8270]">· {p.category}</span>}
                </span>
                <button
                  onClick={() => remove(p.id)}
                  className="text-[11px] text-red-600 hover:underline"
                >
                  삭제
                </button>
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
    </div>
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
