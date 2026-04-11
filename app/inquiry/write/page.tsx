"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LoginRequired } from "@/app/components/login-required";
import { useAuth } from "@/app/components/auth-provider";

export default function InquiryWritePage() {
  return (
    <LoginRequired>
      <InquiryWriteContent />
    </LoginRequired>
  );
}

/* ── 섹션 카드 ── */
function Section({ number, title, subtitle, children }: { number: number; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-5 sm:p-6 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      <div className="flex items-start gap-3 mb-5">
        <span className="shrink-0 w-7 h-7 rounded-full bg-[#F5F0E5] dark:bg-zinc-800 text-[#6B7B3A] dark:text-[#A8B87A] text-[12px] font-bold flex items-center justify-center">
          {number.toString().padStart(2, "0")}
        </span>
        <div className="flex-1 min-w-0 pt-0.5">
          <h2 className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight">{title}</h2>
          {subtitle && <p className="text-[12px] text-[#8C8270] dark:text-zinc-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

/* ── 필드 라벨 ── */
function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1.5 block text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-400 tracking-wide">
      {children}
      {required && <span className="text-[#C0392B] ml-0.5">*</span>}
    </label>
  );
}

function InquiryWriteContent() {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const { user, getIdToken } = useAuth();

  const userEmail = user?.email || "";

  const [titleError, setTitleError] = useState(false);
  const [contentError, setContentError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    const title = (formData.get("title") as string)?.trim() ?? "";
    const content = (formData.get("content") as string)?.trim() ?? "";

    const tErr = !title;
    const cErr = !content;

    setTitleError(tErr);
    setContentError(cErr);

    if (tErr || cErr) return;

    setSubmitting(true);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/inquiries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          author: userEmail,
          email: userEmail,
          title,
          content,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data?.error || "등록에 실패했습니다.");
        return;
      }
      router.push("/inquiry");
    } catch {
      alert("등록 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  const baseInput = "w-full rounded-xl border bg-[#FBF7EB] dark:bg-zinc-800 px-4 py-3 text-[14px] text-[#2A251D] dark:text-zinc-100 focus:outline-none transition-colors";
  const okInput = "border-[#E8E0D0] dark:border-zinc-700 placeholder:text-[#A89B80] focus:border-[#6B7B3A]/50 focus:bg-[#FEFCF7] dark:focus:bg-zinc-900";
  const errInput = "border-[#C0392B] placeholder:text-[#C0392B]/60 focus:border-[#C0392B]";
  const readonlyInput = "w-full rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#F5F0E5]/60 dark:bg-zinc-800/60 px-4 py-3 text-[14px] text-[#6B5D47] dark:text-zinc-400 font-medium";

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F4EC] dark:bg-zinc-950 pb-10">
      <div className="mx-auto w-full max-w-2xl">
        {/* 헤더 바 */}
        <header className="sticky top-14 z-30 bg-[#F8F4EC]/85 dark:bg-zinc-950/85 backdrop-blur-md border-b border-[#E8E0D0]/70 dark:border-zinc-800">
          <div className="flex items-center gap-2 px-4 sm:px-6 py-3">
            <Link
              href="/inquiry"
              className="inline-flex items-center gap-1.5 -ml-1 px-1 py-0.5 rounded-lg text-[#6B7B3A] hover:bg-[#F5F0E5]/60 dark:hover:bg-zinc-800 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-[11px] font-bold tracking-[0.15em] uppercase">Back to Support</span>
            </Link>
          </div>
        </header>

        <form
          ref={formRef}
          onSubmit={(e) => { e.preventDefault(); handleSubmit(new FormData(formRef.current!)); }}
          className="flex flex-col px-4 sm:px-6 py-6 space-y-5"
        >
          {/* 히어로 인트로 */}
          <section className="relative bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-6 sm:p-8 overflow-hidden shadow-[0_1px_0_rgba(0,0,0,0.02),0_12px_32px_-20px_rgba(107,93,71,0.2)]">
            <div aria-hidden className="absolute -top-20 -right-16 w-56 h-56 rounded-full bg-[#6B7B3A]/[0.06] blur-3xl pointer-events-none" />
            <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/30 to-transparent" />

            <div className="relative">
              <div className="inline-flex items-center gap-2 mb-3">
                <span className="w-6 h-px bg-[#6B7B3A]" />
                <span className="text-[11px] font-bold tracking-[0.15em] text-[#6B7B3A] uppercase">New Inquiry</span>
              </div>
              <h1 className="text-[22px] sm:text-[26px] font-bold text-[#2A251D] dark:text-zinc-100 leading-tight tracking-tight mb-2">
                무엇을 도와드릴까요?
              </h1>
              <p className="text-[13px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed max-w-md">
                문의하신 내용은 관리자만 확인할 수 있습니다.
              </p>
            </div>
          </section>

          <p className="text-[11px] text-[#A89B80] px-1"><span className="text-[#C0392B] font-bold">*</span> 표시는 필수 입력 항목입니다</p>

          {/* ─── 섹션 1: 작성자 정보 ─── */}
          <Section number={1} title="작성자 정보" subtitle="로그인 이메일로 자동 등록됩니다">
            <div>
              <FieldLabel>작성자</FieldLabel>
              <input
                value={userEmail}
                readOnly
                className={readonlyInput}
              />
            </div>
          </Section>

          {/* ─── 섹션 2: 문의 내용 ─── */}
          <Section number={2} title="문의 내용" subtitle="구체적으로 작성할수록 더 정확한 답변을 드릴 수 있어요">
            <div>
              <FieldLabel required>제목</FieldLabel>
              <input
                name="title"
                placeholder="예) 로그인 오류 관련 문의"
                onChange={() => titleError && setTitleError(false)}
                className={`${baseInput} ${titleError ? errInput : okInput}`}
              />
            </div>

            <div>
              <FieldLabel required>내용</FieldLabel>
              <textarea
                name="content"
                placeholder={"문의하실 내용을 자유롭게 작성해 주세요.\n\n• 언제 발생한 문제인가요?\n• 어떤 화면/기능에서 발생했나요?\n• 어떤 도움이 필요하신가요?"}
                rows={10}
                style={{ minHeight: 240 }}
                onChange={() => contentError && setContentError(false)}
                className={`${baseInput} resize-none leading-[1.8] ${contentError ? errInput : okInput}`}
              />
            </div>
          </Section>

          {/* ─── 취소 / 등록 CTA ─── */}
          <div className="flex gap-2.5 pt-1">
            <Link
              href="/inquiry"
              className="flex flex-1 items-center justify-center rounded-2xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 py-3.5 text-[14px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors"
            >
              취소
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="flex flex-[2] items-center justify-center gap-2 rounded-2xl bg-[#6B7B3A] hover:bg-[#5A6930] py-3.5 text-[14px] font-bold text-white shadow-[0_8px_24px_-8px_rgba(107,123,58,0.5)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {submitting ? "등록 중..." : "문의 등록하기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
