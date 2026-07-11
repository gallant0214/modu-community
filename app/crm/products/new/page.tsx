"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ProductForm } from "../_components/product-form";

export default function CrmProductNewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialType = searchParams.get("type") || "membership";

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-3xl mx-auto">
      <header className="mb-5">
        <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
          상품 추가
        </h1>
        <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
          판매할 회원권/수업/락커/용품 정보를 입력해 주세요.
        </p>
      </header>

      <ProductForm
        mode="create"
        initial={{ type: initialType }}
        onSaved={() => router.push("/crm/products")}
        onCancel={() => router.push("/crm/products")}
      />
    </div>
  );
}
