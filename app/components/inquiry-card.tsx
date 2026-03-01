"use client";

import { useState } from "react";
import { deleteInquiry } from "@/app/lib/actions";
import type { Inquiry } from "@/app/lib/types";

export function InquiryCard({ inquiry }: { inquiry: Inquiry }) {
  const [showDelete, setShowDelete] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete(formData: FormData) {
    const result = await deleteInquiry(formData);
    if (result?.error) {
      setError(result.error);
    }
  }

  return (
    <div className="border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {inquiry.author}
        </span>
        <span className="text-xs text-zinc-400">
          {new Date(inquiry.created_at).toLocaleString("ko-KR", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        {inquiry.content}
      </p>
      <div className="mt-2">
        {!showDelete ? (
          <button
            onClick={() => setShowDelete(true)}
            className="text-xs text-zinc-400 hover:text-red-500"
          >
            삭제
          </button>
        ) : (
          <form action={handleDelete} className="flex items-center gap-2">
            <input type="hidden" name="id" value={inquiry.id} />
            <input
              name="password"
              type="password"
              placeholder="비밀번호 입력"
              required
              className="w-32 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <button
              type="submit"
              className="rounded-lg px-2 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
            >
              확인
            </button>
            <button
              type="button"
              onClick={() => { setShowDelete(false); setError(""); }}
              className="rounded-lg px-2 py-1.5 text-xs text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              취소
            </button>
            {error && <span className="text-xs text-red-500">{error}</span>}
          </form>
        )}
      </div>
    </div>
  );
}
