"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./auth-provider";

/**
 * 첫 로그인 시 약관·개인정보처리방침 동의 강제.
 * 동의 완료 전에는 다른 모달(닉네임 등) 및 화면 사용 불가.
 */
export default function RequireTermsModal() {
  const { user, termsAgreed, termsLoaded, getIdToken, setTermsAgreedLocal } = useAuth();
  const visible = !!user && termsLoaded && !termsAgreed;

  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (visible) {
      setAgreedTerms(false);
      setAgreedPrivacy(false);
      setSubmitting(false);
      setError("");
    }
  }, [visible]);

  // body scroll lock + ESC 차단
  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey, true);
    };
  }, [visible]);

  if (!visible) return null;

  const allChecked = agreedTerms && agreedPrivacy;

  const handleAgreeAll = () => {
    const next = !allChecked;
    setAgreedTerms(next);
    setAgreedPrivacy(next);
  };

  const handleSubmit = async () => {
    if (!allChecked) {
      setError("이용약관과 개인정보처리방침에 모두 동의해 주세요.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const token = await getIdToken();
      if (!token) {
        setError("로그인 정보를 확인할 수 없습니다.");
        setSubmitting(false);
        return;
      }
      const res = await fetch("/api/users/agree-terms", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        setSubmitting(false);
        return;
      }
      setTermsAgreedLocal();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-[#2A251D]/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="require-terms-title"
    >
      <div className="relative w-full max-w-md bg-[#FEFCF7] dark:bg-zinc-900 rounded-3xl shadow-2xl border border-[#E8E0D0] dark:border-zinc-700 overflow-hidden">
        <div className="px-6 pt-7 pb-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-[#6B7B3A]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h2 id="require-terms-title" className="text-base font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight">
            서비스 이용 동의
          </h2>
          <p className="text-[12px] text-[#8C8270] dark:text-zinc-500 mt-1.5 leading-relaxed">
            모두의 지도사 커뮤니티 이용을 위해<br />
            아래 약관에 동의해 주세요.
          </p>
        </div>

        <div className="px-5 pb-2">
          {/* 전체 동의 */}
          <button
            type="button"
            onClick={handleAgreeAll}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 transition-colors ${
              allChecked
                ? "border-[#6B7B3A] bg-[#F5F0E5]/60 dark:bg-[#6B7B3A]/15"
                : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800"
            }`}
          >
            <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
              allChecked
                ? "bg-[#6B7B3A] shadow-[0_2px_8px_-2px_rgba(107,123,58,0.4)]"
                : "border-2 border-[#E8E0D0] dark:border-zinc-600"
            }`}>
              {allChecked && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
            </span>
            <span className="text-[14px] font-bold text-[#2A251D] dark:text-zinc-100">전체 동의 (필수)</span>
          </button>

          <div className="border-t border-[#E8E0D0]/60 dark:border-zinc-800 my-3" />

          {/* 개별 동의 */}
          <label className="flex items-center gap-3 px-2 py-2 cursor-pointer">
            <button
              type="button"
              onClick={() => setAgreedTerms((v) => !v)}
              className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                agreedTerms
                  ? "bg-[#6B7B3A]"
                  : "border-2 border-[#E8E0D0] dark:border-zinc-600"
              }`}
            >
              {agreedTerms && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
            </button>
            <span className="text-[13px] flex-1 text-[#3A342A] dark:text-zinc-200">
              <button type="button" onClick={() => setAgreedTerms((v) => !v)} className="text-left">
                <span className="text-[#C0392B] font-semibold">[필수]</span> 이용약관 동의
              </button>
            </span>
            <a
              href="/terms.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] text-[#6B7B3A] underline shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              보기
            </a>
          </label>

          <label className="flex items-center gap-3 px-2 py-2 cursor-pointer">
            <button
              type="button"
              onClick={() => setAgreedPrivacy((v) => !v)}
              className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                agreedPrivacy
                  ? "bg-[#6B7B3A]"
                  : "border-2 border-[#E8E0D0] dark:border-zinc-600"
              }`}
            >
              {agreedPrivacy && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
            </button>
            <span className="text-[13px] flex-1 text-[#3A342A] dark:text-zinc-200">
              <button type="button" onClick={() => setAgreedPrivacy((v) => !v)} className="text-left">
                <span className="text-[#C0392B] font-semibold">[필수]</span> 개인정보처리방침 동의
              </button>
            </span>
            <a
              href="/privacy.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] text-[#6B7B3A] underline shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              보기
            </a>
          </label>

          {error && (
            <p className="text-[12px] text-red-500 font-semibold mt-2 px-2">{error}</p>
          )}
        </div>

        <div className="px-5 py-4 border-t border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FBF7EB]/40 dark:bg-transparent">
          <button
            onClick={handleSubmit}
            disabled={!allChecked || submitting}
            className={`w-full py-3.5 rounded-2xl text-[14px] font-bold transition-all ${
              allChecked && !submitting
                ? "bg-[#6B7B3A] text-white hover:bg-[#5A6930] shadow-[0_8px_18px_-12px_rgba(107,123,58,0.65)]"
                : "bg-[#F5F0E5] dark:bg-zinc-700 text-[#A89B80] dark:text-zinc-400 cursor-not-allowed"
            }`}
          >
            {submitting ? "저장 중..." : "동의하고 시작하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
