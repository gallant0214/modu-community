export const revalidate = 30;

import Link from "next/link";
import { sql } from "@/app/lib/db";
import { InquiryRow } from "@/app/components/inquiry-row";
import type { Inquiry } from "@/app/lib/types";

export default async function InquiryPage() {
  const inquiries = (await sql`
    SELECT id, author, title, content, reply, replied_at, hidden, created_at FROM inquiries ORDER BY created_at DESC
  `) as Inquiry[];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl lg:max-w-5xl">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-zinc-300 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              문의 게시판
            </h1>
          </div>
          <Link
            href="/inquiry/write"
            className="rounded-lg bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-600"
          >
            글쓰기
          </Link>
        </header>

        {/* Table header */}
        <div className="flex items-center border-b border-zinc-300 bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
          <span className="w-12 text-center">번호</span>
          <span className="flex-1 pl-3">제목</span>
          <span className="w-20 text-center">글쓴이</span>
          <span className="w-24 text-center">날짜</span>
        </div>

        {/* List */}
        {inquiries.length === 0 ? (
          <div className="bg-white py-16 text-center dark:bg-zinc-900">
            <p className="text-sm text-zinc-400">등록된 문의가 없습니다.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900">
            {inquiries.map((inquiry, i) => (
              <InquiryRow
                key={inquiry.id}
                inquiry={inquiry}
                index={inquiries.length - i}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
