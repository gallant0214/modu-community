"use client";

import { useRef } from "react";
import { createInquiry } from "@/app/lib/actions";

export function InquiryForm() {
  const formRef = useRef<HTMLFormElement>(null);

  async function handleAction(formData: FormData) {
    await createInquiry(formData);
    formRef.current?.reset();
  }

  return (
    <form ref={formRef} action={handleAction} className="space-y-3">
      <div className="flex gap-3">
        <input
          name="author"
          placeholder="작성자"
          required
          className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-500"
        />
        <input
          name="password"
          type="password"
          placeholder="비밀번호"
          required
          className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-500"
        />
      </div>
      <textarea
        name="content"
        placeholder="문의 내용을 입력하세요"
        required
        rows={4}
        className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-500"
      />
      <button
        type="submit"
        className="w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        문의 등록
      </button>
    </form>
  );
}
