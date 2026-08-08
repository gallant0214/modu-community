import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "스포츠마켓 — 모두의 지도사 커뮤니티",
  description: "체육지도사·트레이너를 위한 스포츠마켓. 준비 중입니다.",
};

export default function MarketPage() {
  return (
    <main className="min-h-[60vh] flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full text-center">
        <div className="text-5xl mb-4" aria-hidden="true">🛍️</div>
        <h1 className="text-[22px] font-bold text-[#2A251D] dark:text-zinc-100 mb-2">
          스포츠마켓
        </h1>
        <p className="text-[14px] text-[#6B5D47] dark:text-zinc-400 mb-8">
          페이지 준비 중입니다.
          <br />
          곧 더 좋은 모습으로 찾아뵙겠습니다.
        </p>
        <div className="flex gap-2 justify-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#6B7B3A] text-white text-[13.5px] font-semibold hover:bg-[#5a6932] transition-colors"
          >
            홈으로
          </Link>
          <Link
            href="/trade"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[#3A342A] dark:text-zinc-300 text-[13.5px] font-semibold hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors"
          >
            거래 게시판 보기
          </Link>
        </div>
      </div>
    </main>
  );
}
