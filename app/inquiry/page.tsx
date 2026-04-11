"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { InquiryRow } from "@/app/components/inquiry-row";
import { BackButton } from "@/app/components/back-button";
import { LoginRequired } from "@/app/components/login-required";
import { useAuth } from "@/app/components/auth-provider";
import type { Inquiry } from "@/app/lib/types";

export default function InquiryPage() {
  return (
    <LoginRequired>
      <InquiryPageContent />
    </LoginRequired>
  );
}

function InquiryPageContent() {
  const { getIdToken } = useAuth();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const token = await getIdToken();
        if (!token) { setInquiries([]); return; }
        const res = await fetch("/api/inquiries/mine", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!res.ok) { setInquiries([]); return; }
        const data = await res.json();
        if (!cancelled) setInquiries(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setInquiries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [getIdToken]);

  return (
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl lg:max-w-5xl px-4 sm:px-6 py-4 sm:py-6 space-y-4">

        {/* ═══ 상단 바 ═══ */}
        <div className="sticky top-14 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-[#F8F4EC]/85 dark:bg-zinc-950/85 backdrop-blur-md border-b border-[#E8E0D0]/70 dark:border-zinc-800">
          <BackButton label="Support Board" href="/my" />
        </div>

        {/* ═══ 히어로 카드 ═══ */}
        <section className="relative bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-6 sm:p-8 overflow-hidden shadow-[0_1px_0_rgba(0,0,0,0.02),0_12px_32px_-20px_rgba(107,93,71,0.2)]">
          <div aria-hidden className="absolute -top-20 -right-16 w-56 h-56 rounded-full bg-[#6B7B3A]/[0.06] blur-3xl pointer-events-none" />
          <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/30 to-transparent" />

          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-2 mb-3">
                <span className="w-6 h-px bg-[#6B7B3A]" />
                <span className="text-[11px] font-bold tracking-[0.15em] text-[#6B7B3A] uppercase">Support</span>
              </div>
              <h1 className="text-[22px] sm:text-[26px] font-bold text-[#2A251D] dark:text-zinc-100 leading-tight tracking-tight mb-2">
                무엇이든 편하게 문의해 주세요
              </h1>
              <p className="text-[13px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed max-w-md">
                로그인하신 이메일로 등록된 문의만 표시됩니다. 관리자가 확인 후 답변을 등록해 드립니다.
              </p>
            </div>
            <Link
              href="/inquiry/write"
              className="shrink-0 inline-flex items-center gap-1.5 px-4 sm:px-5 py-2.5 rounded-xl bg-[#6B7B3A] hover:bg-[#5A6930] text-white text-[13px] font-semibold shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)] transition-all hover:-translate-y-0.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              문의하기
            </Link>
          </div>
        </section>

        {/* ═══ 게시판 카드 ═══ */}
        <section className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 sm:px-6 py-4 border-b border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FBF7EB]/50 dark:bg-zinc-800/30">
            <span className="w-1 h-4 rounded-full bg-[#6B7B3A]" />
            <h2 className="text-[13px] font-bold tracking-wide text-[#3A342A] dark:text-zinc-200 uppercase">
              내 문의
            </h2>
            <span className="ml-auto text-[11px] text-[#A89B80]">총 {inquiries.length}건</span>
          </div>

          {/* 테이블 헤더 (데스크톱) */}
          <div className="hidden sm:flex items-center px-5 sm:px-6 py-2.5 border-b border-[#E8E0D0]/60 dark:border-zinc-800 bg-[#FBF7EB]/30 text-[11px] font-bold tracking-wide text-[#A89B80] uppercase">
            <span className="w-12 text-center">번호</span>
            <span className="flex-1 pl-3">제목</span>
            <span className="w-24 text-center">날짜</span>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-[#6B7B3A] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : inquiries.length === 0 ? (
            <div className="py-20 text-center px-4">
              <div className="inline-flex w-14 h-14 mb-3 rounded-2xl bg-[#F5F0E5] dark:bg-zinc-800 items-center justify-center">
                <svg className="w-7 h-7 text-[#A89B80]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <p className="text-[14px] font-semibold text-[#3A342A] dark:text-zinc-300">작성한 문의가 없습니다</p>
              <p className="mt-1 text-[12px] text-[#8C8270]">궁금한 점이 있다면 편하게 문의해 주세요</p>
              <Link
                href="/inquiry/write"
                className="inline-flex items-center gap-1.5 mt-5 rounded-xl bg-[#6B7B3A] hover:bg-[#5A6930] px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                첫 문의 작성하기
              </Link>
            </div>
          ) : (
            <div>
              {inquiries.map((inquiry, i) => (
                <InquiryRow
                  key={inquiry.id}
                  inquiry={inquiry}
                  index={inquiries.length - i}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
