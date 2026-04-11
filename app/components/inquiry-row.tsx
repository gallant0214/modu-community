"use client";

import Link from "next/link";
import type { Inquiry } from "@/app/lib/types";

export function InquiryRow({ inquiry, index }: { inquiry: Inquiry; index: number }) {
  if (inquiry.hidden) return null;
  const hasReply = !!inquiry.reply;

  return (
    <>
      {/* Main row */}
      <Link
        href={`/inquiry/${inquiry.id}`}
        className="group flex items-center border-b border-[#E8E0D0]/50 dark:border-zinc-800 px-5 sm:px-6 py-3 text-[13px] hover:bg-[#F5F0E5]/60 dark:hover:bg-zinc-800/40 transition-colors"
      >
        <span className="hidden sm:block w-12 text-center text-[11px] text-[#A89B80]">{index}</span>
        <span className="flex flex-1 items-center gap-1.5 truncate sm:pl-3 font-semibold text-[#2A251D] dark:text-zinc-100 group-hover:text-[#6B7B3A] transition-colors">
          <svg className="h-3.5 w-3.5 shrink-0 text-[#8C8270]" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <span className="truncate">{inquiry.title}</span>
          {hasReply && (
            <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#EFE7D5] dark:bg-[#6B7B3A]/20 text-[#6B7B3A] dark:text-[#A8B87A] text-[10px] font-bold">
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              답변완료
            </span>
          )}
        </span>
        <span className="hidden sm:block w-24 text-center text-[11px] text-[#A89B80]">
          {new Date(inquiry.created_at).toLocaleDateString("ko-KR", {
            month: "2-digit",
            day: "2-digit",
          })}
        </span>
        <span className="sm:hidden shrink-0 text-[11px] text-[#A89B80] ml-2">
          {new Date(inquiry.created_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
        </span>
      </Link>

      {/* Re: 답변 완료 row */}
      {hasReply && (
        <Link
          href={`/inquiry/${inquiry.id}`}
          className="flex items-center border-b border-[#E8E0D0]/50 dark:border-zinc-800 bg-[#FBF7EB]/30 dark:bg-zinc-900/30 px-5 sm:px-6 py-2.5 text-[13px] hover:bg-[#F5F0E5]/60 dark:hover:bg-zinc-800/40 transition-colors"
        >
          <span className="hidden sm:block w-12 text-center text-[11px] text-[#D4C7AA] dark:text-zinc-600">┗</span>
          <span className="flex-1 sm:pl-3 text-[11px] font-semibold text-[#6B7B3A] dark:text-[#A8B87A] inline-flex items-center gap-1.5">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Re: 답변 완료
          </span>
          <span className="hidden sm:block w-24 text-center text-[11px] text-[#A89B80]">
            {inquiry.replied_at
              ? new Date(inquiry.replied_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })
              : ""}
          </span>
          <span className="sm:hidden shrink-0 text-[11px] text-[#A89B80] ml-2">
            {inquiry.replied_at ? new Date(inquiry.replied_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" }) : ""}
          </span>
        </Link>
      )}
    </>
  );
}
