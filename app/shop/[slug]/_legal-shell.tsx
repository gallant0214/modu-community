import Link from "next/link";
import SellerInfo, { type Seller } from "@/app/pay/SellerInfo";

/** 이용약관·개인정보처리방침 공통 틀 — 두 페이지가 같은 모양을 쓴다 */
export function LegalShell({
  slug,
  centerName,
  heading,
  intro,
  children,
  seller,
}: {
  slug: string;
  centerName: string;
  heading: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
  seller: Seller | null;
}) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-lg bg-white px-5 pb-16 pt-8">
      <header>
        <p className="text-xs font-semibold text-blue-600">{heading}</p>
        <h1 className="mt-1 text-xl font-bold text-gray-900">{centerName}</h1>
        {intro && (
          <div className="mt-3 text-[13.5px] leading-relaxed text-gray-600">{intro}</div>
        )}
      </header>

      {children}

      <div className="mt-8 flex flex-wrap gap-2">
        <Link
          href={`/shop/${slug}`}
          className="inline-block rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white"
        >
          이용권 보러가기
        </Link>
        <Link
          href={`/shop/${slug}/policy`}
          className="inline-block rounded-xl border border-gray-300 px-4 py-3 text-sm font-bold text-gray-700"
        >
          판매 · 환불 정책
        </Link>
      </div>

      <SellerInfo seller={seller} slug={slug} hideRefundPolicy />
    </main>
  );
}

export function LegalSectionBlock({ title, body }: { title: string; body: string }) {
  return (
    <section className="mt-7">
      <h2 className="mb-2 text-sm font-bold text-gray-900">{title}</h2>
      <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-gray-600">{body}</p>
    </section>
  );
}
