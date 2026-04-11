"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoginRequired } from "@/app/components/login-required";
import { useAuth } from "@/app/components/auth-provider";
import type { Inquiry } from "@/app/lib/types";

export default function InquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <LoginRequired>
      <InquiryDetailContent id={id} />
    </LoginRequired>
  );
}

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, "0")}. ${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function InquiryDetailContent({ id }: { id: string }) {
  const router = useRouter();
  const { getIdToken } = useAuth();

  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Edit state
  const [showEditForm, setShowEditForm] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [actionError, setActionError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const token = await getIdToken();
        const res = await fetch(`/api/inquiries/${id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!cancelled) setLoadError(data?.error || "문의를 불러올 수 없습니다");
          return;
        }
        if (!cancelled) {
          setInquiry(data);
          setEditTitle(data.title);
          setEditContent(data.content);
        }
      } catch {
        if (!cancelled) setLoadError("문의를 불러오는 중 오류가 발생했습니다");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id, getIdToken]);

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    setActionError("");
    setSubmitting(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/inquiries/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ title: editTitle, content: editContent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data?.error || "수정에 실패했습니다");
        return;
      }
      setInquiry((prev) => prev ? { ...prev, title: editTitle.trim(), content: editContent.trim() } : prev);
      setShowEditForm(false);
    } catch {
      setActionError("수정 중 오류가 발생했습니다");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    setActionError("");
    setSubmitting(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/inquiries/${id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data?.error || "삭제에 실패했습니다");
        setSubmitting(false);
        return;
      }
      router.replace("/inquiry");
    } catch {
      setActionError("삭제 중 오류가 발생했습니다");
      setSubmitting(false);
    }
  }

  const inputCls = "w-full rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB] dark:bg-zinc-800 px-4 py-3 text-[14px] text-[#2A251D] dark:text-zinc-100 placeholder:text-[#A89B80] focus:border-[#6B7B3A]/50 focus:bg-[#FEFCF7] focus:outline-none transition-colors";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F4EC] dark:bg-zinc-950">
        <div className="w-7 h-7 border-2 border-[#6B7B3A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (loadError || !inquiry) {
    return (
      <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 py-6">
          <div className="sticky top-14 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-[#F8F4EC]/85 dark:bg-zinc-950/85 backdrop-blur-md border-b border-[#E8E0D0]/70 dark:border-zinc-800 mb-6">
            <Link href="/inquiry" className="inline-flex items-center gap-1.5 -ml-1 px-1 py-0.5 rounded-lg text-[#6B7B3A] hover:bg-[#F5F0E5]/60 dark:hover:bg-zinc-800 transition-colors">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-[11px] font-bold tracking-[0.15em] uppercase">Back to Support</span>
            </Link>
          </div>
          <div className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-10 text-center">
            <div className="inline-flex w-14 h-14 mb-3 rounded-2xl bg-[#F5F0E5] dark:bg-zinc-800 items-center justify-center">
              <svg className="w-7 h-7 text-[#A89B80]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-[14px] font-semibold text-[#3A342A] dark:text-zinc-200">{loadError || "문의를 찾을 수 없습니다"}</p>
            <Link href="/inquiry" className="inline-flex items-center gap-1.5 mt-5 rounded-xl bg-[#6B7B3A] hover:bg-[#5A6930] px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)]">
              문의 목록으로
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const hasReply = !!inquiry.reply;

  return (
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950 pb-10">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-4 sm:py-6 space-y-4">

        {/* ═══ 상단 바 ═══ */}
        <div className="sticky top-14 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-[#F8F4EC]/85 dark:bg-zinc-950/85 backdrop-blur-md border-b border-[#E8E0D0]/70 dark:border-zinc-800">
          <Link href="/inquiry" className="inline-flex items-center gap-1.5 -ml-1 px-1 py-0.5 rounded-lg text-[#6B7B3A] hover:bg-[#F5F0E5]/60 dark:hover:bg-zinc-800 transition-colors">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-[11px] font-bold tracking-[0.15em] uppercase">Back to Support</span>
          </Link>
        </div>

        {/* ═══ 히어로 카드 ═══ */}
        <section className="relative bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-6 sm:p-8 shadow-[0_1px_0_rgba(0,0,0,0.02),0_12px_32px_-20px_rgba(107,93,71,0.2)] overflow-hidden">
          <div aria-hidden className="absolute -top-20 -right-16 w-56 h-56 rounded-full bg-[#6B7B3A]/[0.05] blur-3xl pointer-events-none" />
          <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/30 to-transparent" />

          <div className="relative">
            {/* 상태 뱃지 */}
            <div className="flex flex-wrap items-center gap-1.5 mb-4">
              {hasReply ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#EFE7D5] dark:bg-[#6B7B3A]/20 text-[#6B7B3A] dark:text-[#A8B87A] text-[11px] font-bold">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  답변 완료
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#F5E4C8]/60 text-[#B47B2A] text-[11px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#B47B2A] animate-pulse" />
                  답변 대기
                </span>
              )}
              {inquiry.hidden && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#F5F0E5] dark:bg-zinc-800 border border-[#E8E0D0]/70 text-[#8C8270] text-[11px] font-semibold">
                  숨김
                </span>
              )}
            </div>

            {/* 제목 */}
            <h1 className="text-[22px] sm:text-[26px] font-bold text-[#2A251D] dark:text-zinc-100 leading-tight tracking-tight">
              {inquiry.title}
            </h1>

            {/* 메타 */}
            <div className="mt-4 pt-4 border-t border-[#E8E0D0]/60 dark:border-zinc-800 flex items-center gap-2 flex-wrap text-[12px] text-[#8C8270] dark:text-zinc-500">
              <span className="font-semibold text-[#3A342A] dark:text-zinc-200">{inquiry.author}</span>
              <span className="text-[#C7B89B]">·</span>
              <span>{formatDateTime(inquiry.created_at)}</span>
            </div>
          </div>
        </section>

        {/* ═══ 본문 카드 ═══ */}
        <section className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-6 sm:p-8">
          {showEditForm ? (
            <form onSubmit={handleEditSubmit} className="space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-1 h-4 rounded-full bg-[#6B7B3A]" />
                <h2 className="text-[13px] font-bold tracking-wide text-[#3A342A] dark:text-zinc-200 uppercase">문의 수정</h2>
              </div>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="제목"
                className={inputCls}
              />
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={8}
                style={{ minHeight: 180 }}
                className={`${inputCls} resize-none leading-[1.8]`}
              />
              {actionError && <p className="text-[12px] text-[#C0392B] font-medium">{actionError}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowEditForm(false); setEditTitle(inquiry.title); setEditContent(inquiry.content); setActionError(""); }}
                  className="flex-1 rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800 py-3 text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-[2] rounded-xl bg-[#6B7B3A] hover:bg-[#5A6930] py-3 text-[13px] font-bold text-white shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)] disabled:opacity-50 transition-colors"
                >
                  {submitting ? "저장 중..." : "수정 저장"}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4">
                <span className="w-1 h-4 rounded-full bg-[#6B7B3A]" />
                <h2 className="text-[13px] font-bold tracking-wide text-[#3A342A] dark:text-zinc-200 uppercase">문의 내용</h2>
              </div>
              <p className="whitespace-pre-wrap text-[15px] leading-[1.85] text-[#3A342A] dark:text-zinc-200">
                {inquiry.content}
              </p>
            </>
          )}
        </section>

        {/* ═══ 관리자 답변 카드 ═══ */}
        {hasReply && !showEditForm && (
          <section className="relative bg-[#FEFCF7] dark:bg-zinc-900 border-2 border-[#6B7B3A]/35 dark:border-[#6B7B3A]/40 rounded-3xl p-6 sm:p-8 overflow-hidden shadow-[0_1px_0_rgba(0,0,0,0.02),0_12px_32px_-20px_rgba(107,123,58,0.25)]">
            <div aria-hidden className="absolute -top-16 -left-16 w-48 h-48 rounded-full bg-[#6B7B3A]/[0.08] blur-3xl pointer-events-none" />
            <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/55 to-transparent" />

            <div className="relative">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-2xl bg-[#6B7B3A] text-white flex items-center justify-center shadow-[0_4px_14px_-4px_rgba(107,123,58,0.5)]">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold tracking-[0.15em] text-[#6B7B3A] dark:text-[#A8B87A] uppercase">Admin Reply</p>
                  <p className="text-[14px] font-bold text-[#2A251D] dark:text-zinc-100">관리자 답변</p>
                </div>
                {inquiry.replied_at && (
                  <span className="text-[11px] text-[#8C8270] dark:text-zinc-500">
                    {formatDateTime(inquiry.replied_at)}
                  </span>
                )}
              </div>
              <div className="rounded-2xl bg-[#FBF7EB] dark:bg-zinc-800/60 border border-[#E8E0D0]/70 dark:border-zinc-700 px-5 py-5">
                <p className="whitespace-pre-wrap text-[14px] leading-[1.85] text-[#3A342A] dark:text-zinc-200">
                  {inquiry.reply}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ═══ 답변 대기 안내 ═══ */}
        {!hasReply && !showEditForm && (
          <section className="bg-[#FBF7EB] dark:bg-zinc-900 border border-[#E8E0D0]/70 dark:border-zinc-700 rounded-3xl p-6 text-center">
            <div className="inline-flex w-12 h-12 mb-3 rounded-2xl bg-[#F5F0E5] dark:bg-zinc-800 items-center justify-center">
              <svg className="w-6 h-6 text-[#B47B2A]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-[13px] font-semibold text-[#3A342A] dark:text-zinc-200">답변을 준비하고 있어요</p>
            <p className="mt-1 text-[12px] text-[#8C8270] dark:text-zinc-500">관리자가 확인한 후 이메일로 답변드립니다</p>
          </section>
        )}

        {/* ═══ 액션 바 (수정/삭제) ═══ */}
        {!showEditForm && (
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowEditForm(true); setEditTitle(inquiry.title); setEditContent(inquiry.content); }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 px-4 py-2.5 text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
              </svg>
              수정
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#C0392B]/30 bg-[#FEFCF7] dark:bg-zinc-900 px-4 py-2.5 text-[13px] font-semibold text-[#C0392B] hover:bg-[#C0392B]/5 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
              삭제
            </button>
          </div>
        )}

        {/* ═══ 삭제 확인 모달 ═══ */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-[#2A251D]/50 backdrop-blur-sm" onClick={() => !submitting && setShowDeleteConfirm(false)} />
            <div className="relative w-full max-w-sm bg-[#FEFCF7] dark:bg-zinc-900 rounded-3xl shadow-2xl border border-[#E8E0D0] dark:border-zinc-700 p-6 overflow-hidden">
              <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#C0392B]/40 to-transparent" />
              <h3 className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight mb-2">문의 삭제</h3>
              <p className="text-[13px] text-[#6B5D47] dark:text-zinc-400 mb-5 leading-relaxed">
                정말 삭제하시겠습니까? 삭제된 문의는 복구할 수 없습니다.
              </p>
              {actionError && <p className="mb-3 text-[12px] text-[#C0392B] font-medium">{actionError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={submitting}
                  className="flex-1 py-3 rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800 text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-700 disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  onClick={handleDelete}
                  disabled={submitting}
                  className="flex-1 py-3 rounded-xl bg-[#C0392B] hover:bg-[#A0311F] text-[13px] font-bold text-white shadow-[0_4px_14px_-4px_rgba(192,57,43,0.4)] disabled:opacity-50"
                >
                  {submitting ? "삭제 중..." : "삭제"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
