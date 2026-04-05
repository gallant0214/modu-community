"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createInquiry } from "@/app/lib/actions";
import { LoginRequired } from "@/app/components/login-required";

export default function InquiryWritePage() {
  return (
    <LoginRequired>
      <InquiryWriteContent />
    </LoginRequired>
  );
}

function InquiryWriteContent() {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const [authorError, setAuthorError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [titleError, setTitleError] = useState(false);
  const [contentError, setContentError] = useState(false);

  async function handleSubmit(formData: FormData) {
    const author = (formData.get("author") as string)?.trim() ?? "";
    const password = (formData.get("password") as string) ?? "";
    const email = (formData.get("email") as string)?.trim() ?? "";
    const title = (formData.get("title") as string)?.trim() ?? "";
    const content = (formData.get("content") as string)?.trim() ?? "";

    const aErr = !author;
    const pErr = !password;
    const eErr = !email;
    const tErr = !title;
    const cErr = !content;

    setAuthorError(aErr);
    setPasswordError(pErr);
    setEmailError(eErr);
    setTitleError(tErr);
    setContentError(cErr);

    if (aErr || pErr || eErr || tErr || cErr) return;

    const result = await createInquiry(formData);
    if (result?.error) {
      alert(result.error);
      return;
    }
    router.push("/inquiry");
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl lg:max-w-4xl">
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-zinc-300 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900">
          <Link
            href="/inquiry"
            className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            문의 작성
          </h1>
        </header>

        {/* Form */}
        <form ref={formRef} onSubmit={(e) => { e.preventDefault(); handleSubmit(new FormData(formRef.current!)); }} className="bg-white dark:bg-zinc-900">
          <div className="border-b border-zinc-200 dark:border-zinc-800">
            <div className={`flex border-b ${authorError ? "border-red-400" : "border-zinc-200 dark:border-zinc-800"}`}>
              <label className={`flex w-20 shrink-0 items-center px-4 py-3 text-sm font-medium ${authorError ? "bg-red-50 text-red-500 dark:bg-red-950/30" : "bg-zinc-50 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"}`}>
                작성자
              </label>
              <input
                name="author"
                placeholder="이름을 입력하세요"
                onChange={() => authorError && setAuthorError(false)}
                className={`flex-1 px-4 py-3 text-sm text-zinc-900 focus:outline-none dark:bg-zinc-900 dark:text-zinc-100 ${authorError ? "placeholder:text-red-400" : "placeholder:text-zinc-400"}`}
              />
            </div>
            <div className={`flex border-b ${passwordError ? "border-red-400" : "border-zinc-200 dark:border-zinc-800"}`}>
              <label className={`flex w-20 shrink-0 items-center px-4 py-3 text-sm font-medium ${passwordError ? "bg-red-50 text-red-500 dark:bg-red-950/30" : "bg-zinc-50 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"}`}>
                비밀번호
              </label>
              <input
                name="password"
                type="password"
                placeholder="비밀번호를 입력하세요"
                onChange={() => passwordError && setPasswordError(false)}
                className={`flex-1 px-4 py-3 text-sm text-zinc-900 focus:outline-none dark:bg-zinc-900 dark:text-zinc-100 ${passwordError ? "placeholder:text-red-400" : "placeholder:text-zinc-400"}`}
              />
            </div>
            <div className={`flex border-b ${emailError ? "border-red-400" : "border-zinc-200 dark:border-zinc-800"}`}>
              <label className={`flex w-20 shrink-0 items-center px-4 py-3 text-sm font-medium ${emailError ? "bg-red-50 text-red-500 dark:bg-red-950/30" : "bg-zinc-50 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"}`}>
                이메일
              </label>
              <input
                name="email"
                type="email"
                placeholder="답변받을 이메일을 입력하세요"
                onChange={() => emailError && setEmailError(false)}
                className={`flex-1 px-4 py-3 text-sm text-zinc-900 focus:outline-none dark:bg-zinc-900 dark:text-zinc-100 ${emailError ? "placeholder:text-red-400" : "placeholder:text-zinc-400"}`}
              />
            </div>
            <div className={`flex border-b ${titleError ? "border-red-400" : "border-zinc-200 dark:border-zinc-800"}`}>
              <label className={`flex w-20 shrink-0 items-center px-4 py-3 text-sm font-medium ${titleError ? "bg-red-50 text-red-500 dark:bg-red-950/30" : "bg-zinc-50 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"}`}>
                제목
              </label>
              <input
                name="title"
                placeholder="제목을 입력하세요"
                onChange={() => titleError && setTitleError(false)}
                className={`flex-1 px-4 py-3 text-sm text-zinc-900 focus:outline-none dark:bg-zinc-900 dark:text-zinc-100 ${titleError ? "placeholder:text-red-400" : "placeholder:text-zinc-400"}`}
              />
            </div>
          </div>

          <textarea
            name="content"
            placeholder="내용을 입력하세요"
            rows={12}
            onChange={() => contentError && setContentError(false)}
            className={`w-full resize-none px-4 py-4 text-sm leading-relaxed text-zinc-900 focus:outline-none dark:bg-zinc-900 dark:text-zinc-100 ${contentError ? "placeholder:text-red-400" : "placeholder:text-zinc-400"}`}
          />

          <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <Link
              href="/inquiry"
              className="rounded-lg bg-zinc-100 px-5 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              취소
            </Link>
            <button
              type="submit"
              className="rounded-lg bg-blue-500 px-5 py-2 text-sm font-medium text-white hover:bg-blue-600"
            >
              등록
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
