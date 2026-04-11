"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export function BackButton({ label, href }: { label?: string; href?: string }) {
  const router = useRouter();

  // href가 명시된 경우: 해당 경로로 직접 이동 (히스토리 루프 방지)
  if (href) {
    return (
      <Link
        href={href}
        className={
          label
            ? "inline-flex items-center gap-1.5 -ml-1 px-1 py-0.5 rounded-lg text-[#6B7B3A] hover:bg-[#F5F0E5]/60 dark:hover:bg-zinc-800 transition-colors"
            : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        }
      >
        <svg className={label ? "h-4 w-4" : "h-5 w-5"} fill="none" stroke="currentColor" strokeWidth={label ? 2.5 : 2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        {label && <span className="text-[11px] font-bold tracking-[0.15em] uppercase">{label}</span>}
      </Link>
    );
  }

  // href가 없으면 기존 동작: router.back()
  if (label) {
    return (
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 -ml-1 px-1 py-0.5 rounded-lg text-[#6B7B3A] hover:bg-[#F5F0E5]/60 dark:hover:bg-zinc-800 transition-colors"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        <span className="text-[11px] font-bold tracking-[0.15em] uppercase">{label}</span>
      </button>
    );
  }

  return (
    <button
      onClick={() => router.back()}
      className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
    >
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  );
}
