"use client";

import { useState } from "react";
import {
  viewInquiry,
  viewInquiryAdmin,
  replyToInquiry,
  updateInquiry,
  deleteInquiry,
  hideInquiry,
  unhideInquiry,
} from "@/app/lib/actions";
import type { Inquiry } from "@/app/lib/types";

export function InquiryRow({ inquiry, index }: { inquiry: Inquiry; index: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(inquiry.reply);
  const [repliedAt, setRepliedAt] = useState<string | null>(inquiry.replied_at);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPw, setAdminPw] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPasswordInput, setShowPasswordInput] = useState(false);

  // Reply state
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyText, setReplyText] = useState("");

  // Edit state
  const [showEditForm, setShowEditForm] = useState(false);
  const [editTitle, setEditTitle] = useState(inquiry.title);
  const [editContent, setEditContent] = useState("");

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePw, setDeletePw] = useState("");
  const [actionError, setActionError] = useState("");

  // Hide state
  const [showHideConfirm, setShowHideConfirm] = useState(false);
  const [hidden, setHidden] = useState(inquiry.hidden);

  function handleRowClick() {
    if (isOpen) {
      setIsOpen(false);
      setContent(null);
      setPassword("");
      setError("");
      setShowPasswordInput(false);
      setShowReplyForm(false);
      setShowEditForm(false);
      setShowDeleteConfirm(false);
      setActionError("");
      return;
    }
    setIsOpen(true);
    setShowPasswordInput(true);
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const result = await viewInquiry(inquiry.id, password);
    if (result.error) {
      setError(result.error);
    } else {
      setContent(result.content!);
      setReply(result.reply ?? null);
      setRepliedAt(result.replied_at ?? null);
      setEditContent(result.content!);
      setShowPasswordInput(false);
      setIsAdmin(false);
    }
  }

  async function handleAdminView(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const result = await viewInquiryAdmin(inquiry.id, adminPw);
    if (result.error) {
      setError(result.error);
    } else {
      setContent(result.content!);
      setReply(result.reply ?? null);
      setRepliedAt(result.replied_at ?? null);
      setEditContent(result.content!);
      setShowPasswordInput(false);
      setIsAdmin(true);
    }
  }

  async function handleReplySubmit(e: React.FormEvent) {
    e.preventDefault();
    setActionError("");
    const result = await replyToInquiry(inquiry.id, adminPw, replyText);
    if (result?.error) {
      setActionError(result.error);
    } else {
      setReply(replyText);
      setRepliedAt(new Date().toISOString());
      setShowReplyForm(false);
    }
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    setActionError("");
    const pw = isAdmin ? adminPw : password;
    const result = await updateInquiry(inquiry.id, pw, editTitle, editContent);
    if (result?.error) {
      setActionError(result.error);
    } else {
      setContent(editContent);
      setShowEditForm(false);
    }
  }

  async function handleDelete() {
    setActionError("");
    const pw = isAdmin ? adminPw : deletePw;
    const result = await deleteInquiry(inquiry.id, pw);
    if (result?.error) {
      setActionError(result.error);
    }
  }

  const hasReply = !!reply || !!inquiry.reply;

  async function handleHide() {
    const result = await hideInquiry(inquiry.id, adminPw);
    if (result?.error) {
      setActionError(result.error);
    } else {
      setHidden(true);
      setShowHideConfirm(false);
    }
  }

  async function handleUnhide() {
    const result = await unhideInquiry(inquiry.id, adminPw);
    if (result?.error) {
      setActionError(result.error);
    } else {
      setHidden(false);
    }
  }

  // 숨김 처리된 글은 관리자가 내용을 열어본 상태에서만 표시
  if (hidden && !isAdmin) {
    return null;
  }

  return (
    <>
      {/* Main row */}
      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <div
          className={`flex cursor-pointer items-center px-4 py-2.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${hidden ? "opacity-50" : ""}`}
          onClick={handleRowClick}
        >
          <span className="w-12 text-center text-xs text-zinc-400">{index}</span>
          <span className="flex flex-1 items-center gap-1.5 truncate pl-3 font-medium text-zinc-900 dark:text-zinc-100">
            <svg className="h-3.5 w-3.5 shrink-0 text-zinc-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            {hidden && <span className="rounded bg-zinc-300 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400">숨김</span>}
            {inquiry.title}
          </span>
          <span className="w-20 text-center text-xs text-zinc-500 dark:text-zinc-400">
            {inquiry.author}
          </span>
          <span className="w-24 text-center text-xs text-zinc-400">
            {new Date(inquiry.created_at).toLocaleDateString("ko-KR", {
              month: "2-digit",
              day: "2-digit",
            })}
          </span>
        </div>

        {/* Expanded content */}
        {isOpen && (
          <div className="border-t border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/70">
            {/* Password input */}
            {showPasswordInput && !content && (
              <div className="flex flex-col items-center gap-3 py-8">
                <p className="text-sm text-zinc-500">비밀번호를 입력하세요</p>
                <form onSubmit={handlePasswordSubmit} className="flex items-center gap-2">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="비밀번호"
                    className="w-40 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                    autoFocus
                  />
                  <button type="submit" className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">
                    확인
                  </button>
                </form>
                <div className="mt-1 flex flex-col items-center gap-2">
                  <p className="text-xs text-zinc-400">관리자</p>
                  <form onSubmit={handleAdminView} className="flex items-center gap-2">
                    <input
                      type="password"
                      value={adminPw}
                      onChange={(e) => setAdminPw(e.target.value)}
                      placeholder="관리자 비밀번호"
                      className="w-40 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                    <button type="submit" className="rounded-lg bg-zinc-500 px-3 py-1.5 text-xs text-white hover:bg-zinc-600">
                      확인
                    </button>
                  </form>
                </div>
                {error && <p className="text-xs text-red-500">{error}</p>}
              </div>
            )}

            {/* Content revealed */}
            {content && (
              <div className="px-4 py-4">
                {/* Edit form */}
                {showEditForm ? (
                  <form onSubmit={handleEditSubmit} className="space-y-3">
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={5}
                      className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                    <div className="flex gap-2">
                      <button type="submit" className="rounded-lg bg-blue-500 px-4 py-1.5 text-sm text-white hover:bg-blue-600">저장</button>
                      <button type="button" onClick={() => setShowEditForm(false)} className="rounded-lg bg-zinc-200 px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300">취소</button>
                    </div>
                    {actionError && <p className="text-xs text-red-500">{actionError}</p>}
                  </form>
                ) : (
                  <>
                    {/* Post content */}
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                      {content}
                    </p>

                    {/* Reply display */}
                    {reply && (
                      <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-950">
                        <p className="mb-1 text-xs font-semibold text-green-700 dark:text-green-400">관리자 답변</p>
                        <p className="whitespace-pre-wrap text-sm text-green-800 dark:text-green-300">{reply}</p>
                        {repliedAt && (
                          <p className="mt-1 text-xs text-green-600 dark:text-green-500">
                            {new Date(repliedAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="mt-4 flex items-center justify-between border-t border-zinc-200 pt-3 dark:border-zinc-700">
                      {/* Left: reply (admin only) */}
                      <div>
                        {isAdmin && (
                          <button
                            onClick={() => { setShowReplyForm(true); setReplyText(reply ?? ""); }}
                            className="flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                          >
                            답글
                          </button>
                        )}
                      </div>
                      {/* Right: hide + edit + delete */}
                      <div className="flex gap-2">
                        {isAdmin && !hidden && (
                          <button
                            onClick={() => setShowHideConfirm(true)}
                            className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-600 hover:bg-amber-50 dark:border-amber-700 dark:bg-zinc-800 dark:text-amber-400 dark:hover:bg-amber-950"
                          >
                            숨기기
                          </button>
                        )}
                        {isAdmin && hidden && (
                          <button
                            onClick={handleUnhide}
                            className="rounded-lg border border-green-300 bg-white px-4 py-2 text-sm font-medium text-green-600 hover:bg-green-50 dark:border-green-700 dark:bg-zinc-800 dark:text-green-400 dark:hover:bg-green-950"
                          >
                            숨기기취소
                          </button>
                        )}
                        <button
                          onClick={() => setShowEditForm(true)}
                          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(true)}
                          className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:bg-zinc-800 dark:text-red-400 dark:hover:bg-red-950"
                        >
                          삭제
                        </button>
                      </div>
                    </div>

                    {/* Reply form */}
                    {showReplyForm && (
                      <form onSubmit={handleReplySubmit} className="mt-3 space-y-2">
                        <textarea
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="답글을 입력하세요"
                          rows={3}
                          className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                        />
                        <div className="flex gap-2">
                          <button type="submit" className="rounded-lg bg-green-500 px-4 py-1.5 text-sm text-white hover:bg-green-600">답글 등록</button>
                          <button type="button" onClick={() => setShowReplyForm(false)} className="rounded-lg bg-zinc-200 px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300">취소</button>
                        </div>
                        {actionError && <p className="text-xs text-red-500">{actionError}</p>}
                      </form>
                    )}

                    {/* Hide confirm */}
                    {showHideConfirm && (
                      <div className="mt-3 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
                        <p className="flex-1 text-sm text-amber-700 dark:text-amber-300">게시글을 숨기기 처리 하시겠습니까?</p>
                        <button onClick={handleHide} className="rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-600">
                          네
                        </button>
                        <button onClick={() => setShowHideConfirm(false)} className="rounded-lg bg-zinc-200 px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300">
                          아니오
                        </button>
                      </div>
                    )}

                    {/* Delete confirm */}
                    {showDeleteConfirm && (
                      <div className="mt-3 flex items-center gap-2">
                        {!isAdmin && (
                          <input
                            type="password"
                            value={deletePw}
                            onChange={(e) => setDeletePw(e.target.value)}
                            placeholder="비밀번호"
                            className="w-36 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs focus:border-red-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                          />
                        )}
                        <button onClick={handleDelete} className="rounded-lg bg-red-500 px-3 py-1.5 text-xs text-white hover:bg-red-600">
                          {isAdmin ? "삭제 확인" : "확인"}
                        </button>
                        <button onClick={() => { setShowDeleteConfirm(false); setActionError(""); }} className="rounded-lg bg-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300">취소</button>
                        {actionError && <span className="text-xs text-red-500">{actionError}</span>}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Re: 답변 완료 row */}
      {hasReply && (
        <div className="flex items-center border-b border-zinc-200 bg-zinc-50/50 px-4 py-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-900/30">
          <span className="w-12 text-center text-xs text-zinc-300 dark:text-zinc-600">┗</span>
          <span className="flex-1 pl-3 text-xs font-medium text-green-600 dark:text-green-500">
            Re: 답변 완료
          </span>
          <span className="w-20 text-center text-xs text-green-600 dark:text-green-500">관리자</span>
          <span className="w-24 text-center text-xs text-zinc-400">
            {inquiry.replied_at
              ? new Date(inquiry.replied_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })
              : ""}
          </span>
        </div>
      )}
    </>
  );
}
