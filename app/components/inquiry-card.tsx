"use client";

import { useState } from "react";
import { deleteInquiry } from "@/app/lib/actions";
import type { Inquiry } from "@/app/lib/types";

export function InquiryCard({ inquiry }: { inquiry: Inquiry }) {
  const [showDelete, setShowDelete] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete(formData: FormData) {
    const id = Number(formData.get("id"));
    const password = formData.get("password") as string;
    const result = await deleteInquiry(id, password);
    if (result?.error) {
      setError(result.error);
    }
  }

  return (
    <div className="border-b border-[#E8E0D0]/60 dark:border-zinc-800 px-5 sm:px-6 py-4">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[#2A251D] dark:text-zinc-100">
          {inquiry.author}
        </span>
        <span className="text-[11px] text-[#A89B80]">
          {new Date(inquiry.created_at).toLocaleString("ko-KR", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-[13px] leading-[1.8] text-[#3A342A] dark:text-zinc-300">
        {inquiry.content}
      </p>
      <div className="mt-2.5">
        {!showDelete ? (
          <button
            onClick={() => setShowDelete(true)}
            className="text-[11px] font-medium text-[#A89B80] hover:text-[#C0392B] transition-colors"
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
              className="w-36 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB] dark:bg-zinc-800 px-3 py-1.5 text-[12px] text-[#2A251D] dark:text-zinc-100 placeholder:text-[#A89B80] focus:border-[#C0392B]/50 focus:bg-[#FEFCF7] focus:outline-none transition-colors"
            />
            <button
              type="submit"
              className="rounded-lg bg-[#C0392B] hover:bg-[#A0311F] px-3 py-1.5 text-[11px] font-semibold text-white shadow-[0_2px_6px_-2px_rgba(192,57,43,0.4)]"
            >
              확인
            </button>
            <button
              type="button"
              onClick={() => { setShowDelete(false); setError(""); }}
              className="rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800 px-3 py-1.5 text-[11px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5]"
            >
              취소
            </button>
            {error && <span className="text-[11px] text-[#C0392B] font-medium">{error}</span>}
          </form>
        )}
      </div>
    </div>
  );
}
