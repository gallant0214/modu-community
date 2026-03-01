"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { deletePost, likePost, viewPost, createComment, deleteComment, createReport, updateNotice, likeComment, updateComment, verifyPostPassword } from "@/app/lib/actions";
import type { Post, Comment } from "@/app/lib/types";

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}. ${m}. ${day}. ${h}:${min}`;
}

function timeAgo(dateStr: string) {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}. ${m}. ${day}. ${h}:${min}`;
}

export default function PostDetailPage() {
  const router = useRouter();
  const params = useParams();
  const categoryId = params.id as string;
  const postId = params.postId as string;

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [likes, setLikes] = useState(0);
  const [liked, setLiked] = useState(false);

  // 삭제 모달
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");

  // 신고 모달
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportCustomReason, setReportCustomReason] = useState("");
  const [reportDone, setReportDone] = useState(false);

  // 답글 작성
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [commentAuthor, setCommentAuthor] = useState("");
  const [commentPassword, setCommentPassword] = useState("");
  const [commentContent, setCommentContent] = useState("");
  const [commentError, setCommentError] = useState("");

  // 댓글 정렬
  const [commentSort, setCommentSort] = useState<"newest" | "popular" | "likes">("newest");

  // 댓글 공감 처리된 ID
  const [likedCommentIds, setLikedCommentIds] = useState<Set<number>>(new Set());

  // 답글
  const [replyTargetId, setReplyTargetId] = useState<number | null>(null);

  // 게시글 더보기 메뉴 (...)
  const [showPostMenu, setShowPostMenu] = useState(false);

  // 댓글 더보기 메뉴 (...)
  const [menuOpenCommentId, setMenuOpenCommentId] = useState<number | null>(null);

  // 댓글 삭제
  const [deletingCommentId, setDeletingCommentId] = useState<number | null>(null);
  const [commentDeletePassword, setCommentDeletePassword] = useState("");
  const [commentDeleteError, setCommentDeleteError] = useState("");
  const [showAdminInput, setShowAdminInput] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");

  // 댓글 신고
  const [showCommentReportModal, setShowCommentReportModal] = useState(false);
  const [commentReportTargetId, setCommentReportTargetId] = useState<number | null>(null);
  const [commentReportReason, setCommentReportReason] = useState("");
  const [commentReportCustomReason, setCommentReportCustomReason] = useState("");
  const [commentReportDone, setCommentReportDone] = useState(false);

  // 댓글 수정
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editCommentContent, setEditCommentContent] = useState("");
  const [editCommentPassword, setEditCommentPassword] = useState("");
  const [editCommentError, setEditCommentError] = useState("");
  const [editCommentPasswordVerified, setEditCommentPasswordVerified] = useState(false);

  // 게시글 수정 비밀번호 모달
  const [showEditModal, setShowEditModal] = useState(false);
  const [editPassword, setEditPassword] = useState("");
  const [editError, setEditError] = useState("");

  // 공지 수정
  const [showNoticePasswordModal, setShowNoticePasswordModal] = useState(false);
  const [noticeAdminPassword, setNoticeAdminPassword] = useState("");
  const [noticePasswordError, setNoticePasswordError] = useState("");
  const [isNoticeEditing, setIsNoticeEditing] = useState(false);
  const [noticeEditTitle, setNoticeEditTitle] = useState("");
  const [noticeEditContent, setNoticeEditContent] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/post/${postId}`).then((r) => r.json()),
      fetch(`/api/post/${postId}/comments`).then((r) => r.json()),
    ]).then(([postData, commentsData]) => {
      setPost(postData);
      setLikes(Number(postData?.likes ?? 0));
      setComments(commentsData ?? []);
      setLoading(false);
      viewPost(Number(postId));
    }).catch(() => setLoading(false));
  }, [postId]);

  // ··· 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    if (menuOpenCommentId === null) return;
    const handleClick = () => setMenuOpenCommentId(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [menuOpenCommentId]);

  // 게시글 ··· 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    if (!showPostMenu) return;
    const handleClick = () => setShowPostMenu(false);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [showPostMenu]);

  async function handleLike() {
    const result = await likePost(Number(postId), Number(categoryId));
    if (result?.unliked) {
      setLiked(false);
      setLikes((prev) => Math.max(prev - 1, 0));
    } else {
      setLiked(true);
      setLikes((prev) => prev + 1);
    }
  }

  async function handleDelete() {
    if (!deletePassword.trim()) {
      setDeleteError("비밀번호를 입력해주세요");
      return;
    }
    const result = await deletePost(Number(postId), Number(categoryId), deletePassword);
    if (result?.error) {
      setDeleteError(result.error);
      return;
    }
    router.push(`/category/${categoryId}`);
  }

  async function handleCommentSubmit() {
    if (!commentAuthor.trim() || !commentPassword.trim() || !commentContent.trim()) {
      setCommentError("모든 항목을 입력해주세요");
      return;
    }
    const result = await createComment(Number(postId), Number(categoryId), commentAuthor, commentPassword, commentContent, replyTargetId);
    if (result?.error) {
      setCommentError(result.error);
      return;
    }
    // 댓글 목록 새로고침
    const updated = await fetch(`/api/post/${postId}/comments`).then((r) => r.json());
    setComments(updated);
    setCommentContent("");
    setCommentError("");
    setReplyTargetId(null);
    setShowCommentForm(false);
    // 닉네임/비밀번호는 유지 (연속 답글 작성 편의)
  }

  async function handleCommentDelete(commentId: number, pw?: string) {
    const password = pw ?? commentDeletePassword;
    if (!password.trim()) {
      setCommentDeleteError("비밀번호를 입력해주세요");
      return;
    }
    const result = await deleteComment(commentId, Number(postId), Number(categoryId), password);
    if (result?.error) {
      setCommentDeleteError(result.error);
      return;
    }
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    setDeletingCommentId(null);
    setCommentDeletePassword("");
    setCommentDeleteError("");
    setShowAdminInput(false);
    setAdminPassword("");
  }

  async function handleCommentEditVerify(commentId: number) {
    if (!editCommentPassword.trim()) {
      setEditCommentError("비밀번호를 입력해주세요");
      return;
    }
    // 비밀번호 확인을 위해 현재 내용으로 업데이트 시도
    const comment = comments.find((c) => c.id === commentId);
    if (!comment) return;
    const result = await updateComment(commentId, Number(postId), Number(categoryId), editCommentPassword, comment.content);
    if (result?.error) {
      setEditCommentError(result.error);
      return;
    }
    setEditCommentPasswordVerified(true);
    setEditCommentContent(comment.content);
    setEditCommentError("");
  }

  async function handleCommentEditSave(commentId: number) {
    if (!editCommentContent.trim()) {
      setEditCommentError("내용을 입력해주세요");
      return;
    }
    const result = await updateComment(commentId, Number(postId), Number(categoryId), editCommentPassword, editCommentContent);
    if (result?.error) {
      setEditCommentError(result.error);
      return;
    }
    setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, content: editCommentContent.trim() } : c));
    setEditingCommentId(null);
    setEditCommentContent("");
    setEditCommentPassword("");
    setEditCommentError("");
    setEditCommentPasswordVerified(false);
  }

  async function handleNoticePasswordSubmit() {
    if (!noticeAdminPassword.trim()) {
      setNoticePasswordError("비밀번호를 입력해주세요");
      return;
    }
    // 비밀번호 확인을 위해 더미 업데이트 시도
    const result = await updateNotice(Number(postId), noticeAdminPassword, post!.title, post!.content);
    if (result?.error) {
      setNoticePasswordError(result.error);
      return;
    }
    setShowNoticePasswordModal(false);
    setNoticeEditTitle(post!.title);
    setNoticeEditContent(post!.content);
    setIsNoticeEditing(true);
  }

  async function handleNoticeSave() {
    if (!noticeEditTitle.trim() || !noticeEditContent.trim()) {
      alert("제목과 내용을 입력해주세요");
      return;
    }
    const result = await updateNotice(Number(postId), noticeAdminPassword, noticeEditTitle, noticeEditContent);
    if (result?.error) {
      alert(result.error);
      return;
    }
    setPost({ ...post!, title: noticeEditTitle.trim(), content: noticeEditContent.trim() });
    setIsNoticeEditing(false);
    setNoticeAdminPassword("");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-zinc-950">
        <p className="text-sm text-zinc-400">불러오는 중...</p>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-zinc-950">
        <p className="text-sm text-zinc-400">게시글을 찾을 수 없습니다.</p>
      </div>
    );
  }

  const tags = post.tags ? post.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-zinc-950">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col md:max-w-3xl lg:max-w-4xl">
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3 md:px-6 md:py-4 dark:border-zinc-800">
          <Link
            href={`/category/${categoryId}`}
            className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            {post?.category_name ? `${post.category_name}의 게시글` : "게시글"}
          </h1>
        </header>

        {/* Post Content */}
        <div className="flex-1 px-4 py-5 md:px-6 md:py-8">
          {/* Tags */}
          {(tags.length > 0 || (post.region && post.region !== "전국")) && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-600 dark:bg-violet-950 dark:text-violet-400"
                >
                  {tag}
                </span>
              ))}
              {post.region && post.region !== "전국" && (
                <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  {post.region}
                </span>
              )}
            </div>
          )}

          {/* Title */}
          {isNoticeEditing ? (
            <input
              value={noticeEditTitle}
              onChange={(e) => setNoticeEditTitle(e.target.value)}
              className="w-full rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-lg font-bold text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-blue-700 dark:bg-blue-950 dark:text-zinc-100"
            />
          ) : (
            <h2 className="text-lg font-bold leading-snug text-zinc-900 md:text-xl dark:text-zinc-100">
              {post.title}
            </h2>
          )}

          {/* Author Info */}
          <div className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
            <span>{post.author}{post.ip_display && <span className="text-zinc-400">({post.ip_display})</span>}</span>
            {post.region && (
              <>
                <span>·</span>
                <span>{post.region}</span>
              </>
            )}
            <span>·</span>
            <span>{formatDate(post.created_at)}</span>
            {/* 조회수 */}
            <span className="ml-auto text-xs text-zinc-400">조회 {post.views}</span>
            {/* ··· 더보기 메뉴 (수정/삭제) */}
            {!post.is_notice && (
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowPostMenu(!showPostMenu); }}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <circle cx="4" cy="10" r="1.5" />
                    <circle cx="10" cy="10" r="1.5" />
                    <circle cx="16" cy="10" r="1.5" />
                  </svg>
                </button>
                {showPostMenu && (
                  <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-8 z-10 min-w-[80px] overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                    <button
                      onClick={() => {
                        setShowPostMenu(false);
                        setShowEditModal(true);
                        setEditPassword("");
                        setEditError("");
                      }}
                      className="flex w-full items-center px-3.5 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                      수정
                    </button>
                    <hr className="border-zinc-100 dark:border-zinc-700" />
                    <button
                      onClick={() => {
                        setShowPostMenu(false);
                        setShowDeleteModal(true);
                        setDeleteError("");
                        setDeletePassword("");
                      }}
                      className="flex w-full items-center px-3.5 py-2 text-xs font-medium text-red-500 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                    >
                      삭제
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Divider */}
          <hr className="my-4 border-zinc-200 dark:border-zinc-800" />

          {/* Content */}
          {isNoticeEditing ? (
            <textarea
              value={noticeEditContent}
              onChange={(e) => setNoticeEditContent(e.target.value)}
              rows={10}
              className="w-full resize-none rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm leading-relaxed text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-blue-700 dark:bg-blue-950 dark:text-zinc-100"
            />
          ) : (
            <div className="whitespace-pre-wrap rounded-2xl bg-zinc-50 p-4 text-sm leading-relaxed text-zinc-700 md:p-6 md:text-base dark:bg-zinc-900 dark:text-zinc-300">
              {post.content}
            </div>
          )}

          {/* 액션 버튼: 신고(왼쪽) / 좋아요+댓글달기(오른쪽) */}
          <div className="mt-6 flex items-center border-y border-zinc-200 py-3 dark:border-zinc-800">
            <button
              onClick={() => { setShowReportModal(true); setReportReason(""); setReportCustomReason(""); setReportDone(false); }}
              className="flex items-center gap-1.5 text-sm font-medium text-red-500 hover:text-red-600"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>신고</span>
            </button>
            <div className="ml-auto flex items-center gap-5">
            <button
              onClick={handleLike}
              className={`flex items-center gap-1.5 text-sm font-medium transition-all ${
                liked
                  ? "text-[#1877F2]"
                  : "text-[#65676B] hover:text-[#1877F2] dark:text-zinc-400 dark:hover:text-[#1877F2]"
              }`}
            >
              <svg className="h-4 w-4" fill={liked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
              </svg>
              <span>좋아요 {likes}</span>
            </button>
            <button
              onClick={() => { setReplyTargetId(null); setShowCommentForm(!showCommentForm); }}
              className="flex items-center gap-1.5 text-sm font-bold text-zinc-900 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span>댓글달기</span>
            </button>
            </div>
          </div>

          {/* 댓글 섹션 */}
          <div className="mt-5">
            {/* 전체 댓글 N개 + 정렬 */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                전체 댓글 <span className="text-blue-500">{comments.length}</span>개
              </span>
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <button
                  onClick={() => setCommentSort("newest")}
                  className={`flex items-center gap-0.5 ${commentSort === "newest" ? "font-semibold text-zinc-700 dark:text-zinc-200" : "hover:text-zinc-600 dark:hover:text-zinc-300"}`}
                >
                  {commentSort === "newest" && <span className="text-blue-500">✔</span>}
                  최신순
                </button>
                <button
                  onClick={() => setCommentSort("popular")}
                  className={`flex items-center gap-0.5 ${commentSort === "popular" ? "font-semibold text-zinc-700 dark:text-zinc-200" : "hover:text-zinc-600 dark:hover:text-zinc-300"}`}
                >
                  {commentSort === "popular" && <span className="text-blue-500">✔</span>}
                  인기순
                </button>
                <button
                  onClick={() => setCommentSort("likes")}
                  className={`flex items-center gap-0.5 ${commentSort === "likes" ? "font-semibold text-zinc-700 dark:text-zinc-200" : "hover:text-zinc-600 dark:hover:text-zinc-300"}`}
                >
                  {commentSort === "likes" && <span className="text-blue-500">✔</span>}
                  공감순
                </button>
              </div>
            </div>

            {/* 댓글 작성 폼 (새 댓글 전용, 답글은 해당 댓글 아래에 표시) */}
            {showCommentForm && !replyTargetId && (
              <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
                <div className="flex gap-2">
                  <input
                    value={commentAuthor}
                    onChange={(e) => setCommentAuthor(e.target.value)}
                    placeholder="닉네임"
                    className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                  <input
                    type="password"
                    value={commentPassword}
                    onChange={(e) => setCommentPassword(e.target.value)}
                    placeholder="비밀번호"
                    className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
                <textarea
                  value={commentContent}
                  onChange={(e) => setCommentContent(e.target.value)}
                  placeholder="댓글을 입력하세요"
                  rows={3}
                  className="mt-2 w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm leading-relaxed text-zinc-900 placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                />
                {commentError && (
                  <p className="mt-2 text-xs text-red-500">{commentError}</p>
                )}
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    onClick={() => { setShowCommentForm(false); setCommentError(""); }}
                    className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleCommentSubmit}
                    className="rounded-lg bg-blue-500 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-600"
                  >
                    등록
                  </button>
                </div>
              </div>
            )}

            {/* 댓글 목록 */}
            <div className="mt-4 space-y-0 divide-y divide-zinc-100 dark:divide-zinc-800">
              {comments.length === 0 && !showCommentForm && (
                <p className="py-6 text-center text-sm text-zinc-400">
                  아직 댓글이 없습니다. 첫 댓글을 남겨보세요!
                </p>
              )}
              {(() => {
                // 부모 댓글만 정렬
                const rootComments = comments.filter((c) => !c.parent_id);
                const replies = comments.filter((c) => c.parent_id);
                const sorted = [...rootComments].sort((a, b) => {
                  if (commentSort === "likes") return (b.likes ?? 0) - (a.likes ?? 0) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                  if (commentSort === "popular") return (b.reply_count ?? 0) - (a.reply_count ?? 0) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                });

                function renderComment(comment: Comment, isReply = false) {
                  const childReplies = replies.filter((r) => r.parent_id === comment.id)
                    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

                  return (
                    <div key={comment.id} className={isReply ? "border-l-2 border-blue-100 pl-4 dark:border-blue-900" : ""}>
                      <div className="py-3">
                        <div className="flex items-start gap-3">
                          {/* 왼쪽: 닉네임 + 내용 + 날짜/답글쓰기/신고 */}
                          <div className="min-w-0 flex-1">
                            {/* 닉네임 + IP */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100">
                                {comment.author}
                              </span>
                              {comment.ip_display && (
                                <span className="text-[11px] text-zinc-400">({comment.ip_display})</span>
                              )}
                            </div>
                            {/* 댓글 내용 */}
                            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                              {comment.content}
                            </p>
                            {/* 날짜 + 답글쓰기 + 신고 */}
                            <div className="mt-1.5 flex items-center gap-3 text-xs">
                              <span className="text-zinc-400">
                                {formatDate(comment.created_at)}
                              </span>
                              <button
                                onClick={() => {
                                  setReplyTargetId(replyTargetId === comment.id ? null : comment.id);
                                  setShowCommentForm(false);
                                  setCommentContent("");
                                  setCommentError("");
                                }}
                                className="font-semibold text-zinc-900 hover:text-zinc-600 dark:text-zinc-100 dark:hover:text-zinc-400"
                              >
                                답글쓰기
                              </button>
                              <button
                                onClick={() => {
                                  setCommentReportTargetId(comment.id);
                                  setCommentReportReason("");
                                  setCommentReportCustomReason("");
                                  setCommentReportDone(false);
                                  setShowCommentReportModal(true);
                                }}
                                className="font-medium text-red-500 hover:text-red-600"
                              >
                                신고
                              </button>
                            </div>
                          </div>

                          {/* 오른쪽: ··· 버튼 + 하트 (세로 배치) */}
                          <div className="relative flex shrink-0 flex-col items-center gap-1 pt-0.5">
                            {/* ··· 더보기 버튼 */}
                            <button
                              onClick={(e) => { e.stopPropagation(); setMenuOpenCommentId(menuOpenCommentId === comment.id ? null : comment.id); }}
                              className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            >
                              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                                <circle cx="4" cy="10" r="1.5" />
                                <circle cx="10" cy="10" r="1.5" />
                                <circle cx="16" cy="10" r="1.5" />
                              </svg>
                            </button>
                            {/* 드롭다운 메뉴 */}
                            {menuOpenCommentId === comment.id && (
                              <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-8 z-10 min-w-[80px] overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                                <button
                                  onClick={() => {
                                    setMenuOpenCommentId(null);
                                    setEditingCommentId(comment.id);
                                    setEditCommentPassword("");
                                    setEditCommentContent("");
                                    setEditCommentError("");
                                    setEditCommentPasswordVerified(false);
                                  }}
                                  className="flex w-full items-center px-3.5 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700"
                                >
                                  수정
                                </button>
                                <hr className="border-zinc-100 dark:border-zinc-700" />
                                <button
                                  onClick={() => {
                                    setMenuOpenCommentId(null);
                                    setDeletingCommentId(comment.id);
                                    setCommentDeletePassword("");
                                    setCommentDeleteError("");
                                  }}
                                  className="flex w-full items-center px-3.5 py-2 text-xs font-medium text-red-500 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                                >
                                  삭제
                                </button>
                              </div>
                            )}
                            {/* 하트 (공감) 버튼 */}
                            <button
                              onClick={async () => {
                                const wasLiked = likedCommentIds.has(comment.id);
                                const result = await likeComment(comment.id, Number(postId), Number(categoryId));
                                if (result?.error) { alert(result.error); return; }
                                if (wasLiked || result?.unliked) {
                                  setLikedCommentIds((prev) => { const s = new Set(prev); s.delete(comment.id); return s; });
                                  setComments((prev) => prev.map((c) => c.id === comment.id ? { ...c, likes: Math.max((c.likes ?? 0) - 1, 0) } : c));
                                } else {
                                  setLikedCommentIds((prev) => new Set(prev).add(comment.id));
                                  setComments((prev) => prev.map((c) => c.id === comment.id ? { ...c, likes: (c.likes ?? 0) + 1 } : c));
                                }
                              }}
                              className="flex h-7 w-7 items-center justify-center"
                            >
                              <svg className="h-5 w-5" fill={likedCommentIds.has(comment.id) ? "#ef4444" : "none"} stroke="#ef4444" strokeWidth={1.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                              </svg>
                            </button>
                            {(comment.likes ?? 0) > 0 && (
                              <span className="text-[11px] font-bold text-red-500">{comment.likes}</span>
                            )}
                          </div>
                        </div>

                        {/* 댓글 수정 */}
                        {editingCommentId === comment.id && (
                          <div className="mt-2 space-y-2">
                            {!editCommentPasswordVerified ? (
                              <>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="password"
                                    value={editCommentPassword}
                                    onChange={(e) => { setEditCommentPassword(e.target.value); setEditCommentError(""); }}
                                    placeholder="비밀번호 입력"
                                    className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                    onKeyDown={(e) => { if (e.key === "Enter") handleCommentEditVerify(comment.id); }}
                                    autoFocus
                                  />
                                  <button onClick={() => handleCommentEditVerify(comment.id)} className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600">확인</button>
                                  <button onClick={() => { setEditingCommentId(null); setEditCommentError(""); }} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">취소</button>
                                </div>
                                {editCommentError && <p className="text-xs text-red-500">{editCommentError}</p>}
                              </>
                            ) : (
                              <>
                                <textarea
                                  value={editCommentContent}
                                  onChange={(e) => setEditCommentContent(e.target.value)}
                                  rows={3}
                                  className="w-full resize-none rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm leading-relaxed text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none dark:border-blue-700 dark:bg-blue-950 dark:text-zinc-100"
                                  autoFocus
                                />
                                {editCommentError && <p className="text-xs text-red-500">{editCommentError}</p>}
                                <div className="flex justify-end gap-2">
                                  <button onClick={() => { setEditingCommentId(null); setEditCommentPasswordVerified(false); }} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">취소</button>
                                  <button onClick={() => handleCommentEditSave(comment.id)} className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600">저장</button>
                                </div>
                              </>
                            )}
                          </div>
                        )}

                        {/* 댓글 삭제 비밀번호 */}
                        {deletingCommentId === comment.id && (
                          <div className="mt-2 space-y-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="password"
                                value={commentDeletePassword}
                                onChange={(e) => { setCommentDeletePassword(e.target.value); setCommentDeleteError(""); }}
                                placeholder="비밀번호 입력"
                                className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                onKeyDown={(e) => { if (e.key === "Enter") handleCommentDelete(comment.id); }}
                                autoFocus
                              />
                              <button onClick={() => handleCommentDelete(comment.id)} className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600">확인</button>
                              <button onClick={() => { setDeletingCommentId(null); setShowAdminInput(false); setAdminPassword(""); }} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">취소</button>
                            </div>
                            {commentDeleteError && <p className="text-xs text-red-500">{commentDeleteError}</p>}
                            {!showAdminInput ? (
                              <button onClick={() => setShowAdminInput(true)} className="text-xs text-zinc-400 underline hover:text-zinc-600 dark:hover:text-zinc-300">관리자 비밀번호로 삭제</button>
                            ) : (
                              <div className="flex items-center gap-2">
                                <input type="password" value={adminPassword} onChange={(e) => { setAdminPassword(e.target.value); setCommentDeleteError(""); }} placeholder="관리자 비밀번호 입력" className="flex-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-amber-500 focus:outline-none dark:border-amber-700 dark:bg-amber-950 dark:text-zinc-100" onKeyDown={(e) => { if (e.key === "Enter") handleCommentDelete(comment.id, adminPassword); }} autoFocus />
                                <button onClick={() => handleCommentDelete(comment.id, adminPassword)} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600">삭제</button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* 답글 작성 폼 (인라인) */}
                        {replyTargetId === comment.id && (
                          <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-950/30">
                            <div className="mb-2 flex items-center gap-2">
                              <span className="text-xs font-semibold text-blue-500">
                                @{comment.author} 에게 답글
                              </span>
                              <button onClick={() => { setReplyTargetId(null); setCommentError(""); }} className="text-xs text-zinc-400 hover:text-zinc-600">✕</button>
                            </div>
                            <div className="flex gap-2">
                              <input
                                value={commentAuthor}
                                onChange={(e) => setCommentAuthor(e.target.value)}
                                placeholder="닉네임"
                                className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                              />
                              <input
                                type="password"
                                value={commentPassword}
                                onChange={(e) => setCommentPassword(e.target.value)}
                                placeholder="비밀번호"
                                className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                              />
                            </div>
                            <textarea
                              value={commentContent}
                              onChange={(e) => setCommentContent(e.target.value)}
                              placeholder="답글을 입력하세요"
                              rows={2}
                              className="mt-2 w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm leading-relaxed text-zinc-900 placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                              autoFocus
                            />
                            {commentError && (
                              <p className="mt-1 text-xs text-red-500">{commentError}</p>
                            )}
                            <div className="mt-2 flex justify-end gap-2">
                              <button
                                onClick={() => { setReplyTargetId(null); setCommentError(""); }}
                                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                              >
                                취소
                              </button>
                              <button
                                onClick={handleCommentSubmit}
                                className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
                              >
                                등록
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 대댓글 */}
                      {childReplies.length > 0 && (
                        <div className="ml-2">
                          {childReplies.map((reply) => renderComment(reply, true))}
                        </div>
                      )}
                    </div>
                  );
                }

                return sorted.map((comment) => renderComment(comment));
              })()}
            </div>
          </div>
        </div>

        {/* Bottom Actions (공지 전용) */}
        {post.is_notice && (
          <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-4 md:px-6 dark:border-zinc-800">
            {isNoticeEditing ? (
              <>
                <button
                  onClick={() => { setIsNoticeEditing(false); setNoticeAdminPassword(""); }}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 px-5 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  취소
                </button>
                <button
                  onClick={handleNoticeSave}
                  className="rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-600"
                >
                  저장
                </button>
              </>
            ) : (
              <button
                onClick={() => { setShowNoticePasswordModal(true); setNoticeAdminPassword(""); setNoticePasswordError(""); }}
                className="ml-auto rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-600"
              >
                수정하기
              </button>
            )}
          </div>
        )}
      </div>

      {/* 수정 비밀번호 모달 */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h3 className="mb-2 text-base font-bold text-zinc-900 dark:text-zinc-100">
              게시글 수정
            </h3>
            <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
              수정하려면 비밀번호를 입력해주세요.
            </p>
            <input
              type="password"
              value={editPassword}
              onChange={(e) => { setEditPassword(e.target.value); setEditError(""); }}
              placeholder="비밀번호 입력"
              className="mb-3 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              onKeyDown={async (e) => {
                if (e.key === "Enter") {
                  const result = await verifyPostPassword(Number(postId), editPassword);
                  if (result?.error) { setEditError(result.error); return; }
                  router.push(`/category/${categoryId}/post/${postId}/edit`);
                }
              }}
              autoFocus
            />
            {editError && (
              <p className="mb-3 text-sm text-red-500">{editError}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex flex-1 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                취소
              </button>
              <button
                onClick={async () => {
                  const result = await verifyPostPassword(Number(postId), editPassword);
                  if (result?.error) { setEditError(result.error); return; }
                  router.push(`/category/${categoryId}/post/${postId}/edit`);
                }}
                className="flex flex-1 items-center justify-center rounded-xl bg-blue-500 py-3 text-sm font-semibold text-white hover:bg-blue-600"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 비밀번호 모달 */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h3 className="mb-2 text-base font-bold text-zinc-900 dark:text-zinc-100">
              게시글 삭제
            </h3>
            <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
              삭제하려면 비밀번호를 입력해주세요.
            </p>
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(""); }}
              placeholder="비밀번호 입력"
              className="mb-3 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              onKeyDown={(e) => { if (e.key === "Enter") handleDelete(); }}
              autoFocus
            />
            {deleteError && (
              <p className="mb-3 text-sm text-red-500">{deleteError}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex flex-1 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                className="flex flex-1 items-center justify-center rounded-xl bg-red-500 py-3 text-sm font-semibold text-white hover:bg-red-600"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 공지 수정 비밀번호 모달 */}
      {showNoticePasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h3 className="mb-2 text-base font-bold text-zinc-900 dark:text-zinc-100">
              공지 수정
            </h3>
            <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
              관리자 비밀번호를 입력해주세요.
            </p>
            <input
              type="password"
              value={noticeAdminPassword}
              onChange={(e) => { setNoticeAdminPassword(e.target.value); setNoticePasswordError(""); }}
              placeholder="관리자 비밀번호 입력"
              className="mb-3 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              onKeyDown={(e) => { if (e.key === "Enter") handleNoticePasswordSubmit(); }}
              autoFocus
            />
            {noticePasswordError && (
              <p className="mb-3 text-sm text-red-500">{noticePasswordError}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowNoticePasswordModal(false)}
                className="flex flex-1 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                취소
              </button>
              <button
                onClick={handleNoticePasswordSubmit}
                className="flex flex-1 items-center justify-center rounded-xl bg-blue-500 py-3 text-sm font-semibold text-white hover:bg-blue-600"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 댓글 신고 모달 */}
      {showCommentReportModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
          <div className="w-full max-w-sm rounded-t-2xl bg-white px-6 pb-6 pt-4 shadow-xl sm:rounded-2xl dark:bg-zinc-900">
            <div className="mb-4 flex justify-center">
              <div className="h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-600" />
            </div>

            {commentReportDone ? (
              <div className="py-8 text-center">
                <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">신고가 접수되었습니다.</p>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">검토 후 조치하겠습니다.</p>
                <button
                  onClick={() => setShowCommentReportModal(false)}
                  className="mt-6 w-full rounded-xl bg-violet-500 py-3 text-sm font-semibold text-white hover:bg-violet-600"
                >
                  확인
                </button>
              </div>
            ) : (
              <>
                <h3 className="mb-5 text-center text-base font-bold text-zinc-900 dark:text-zinc-100">
                  해당 댓글을 어떤 이유로 신고하시나요?
                </h3>

                <div className="space-y-2">
                  {["스팸/영리목적 홍보", "욕설/비하발언", "허위 정보 유포", "부적절한 콘텐츠", "기타"].map((reason) => (
                    <div key={reason}>
                      <button
                        onClick={() => {
                          setCommentReportReason(reason);
                          if (reason !== "기타") setCommentReportCustomReason("");
                        }}
                        className={`flex w-full items-center justify-between rounded-xl border px-4 py-3.5 text-sm transition-all ${
                          commentReportReason === reason
                            ? "border-violet-500 bg-violet-50 font-semibold text-zinc-900 dark:border-violet-400 dark:bg-violet-950 dark:text-zinc-100"
                            : "border-zinc-200 text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        <span>{reason}</span>
                        <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                          commentReportReason === reason
                            ? "border-violet-500 bg-violet-500 dark:border-violet-400 dark:bg-violet-400"
                            : "border-zinc-300 dark:border-zinc-600"
                        }`}>
                          {commentReportReason === reason && (
                            <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <circle cx="10" cy="10" r="4" />
                            </svg>
                          )}
                        </span>
                      </button>
                      {reason === "기타" && (
                        <div
                          className="overflow-hidden transition-all duration-300 ease-in-out"
                          style={{
                            maxHeight: commentReportReason === "기타" ? "150px" : "0px",
                            opacity: commentReportReason === "기타" ? 1 : 0,
                          }}
                        >
                          <textarea
                            value={commentReportCustomReason}
                            onChange={(e) => setCommentReportCustomReason(e.target.value)}
                            placeholder="신고 사유를 입력해주세요"
                            rows={3}
                            className="mt-2 w-full resize-none rounded-xl border border-violet-300 bg-violet-50 px-4 py-3 text-sm leading-relaxed text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none dark:border-violet-700 dark:bg-violet-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex gap-3">
                  <button
                    onClick={() => setShowCommentReportModal(false)}
                    className="flex flex-1 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  >
                    취소
                  </button>
                  <button
                    onClick={async () => {
                      if (!commentReportReason || commentReportTargetId === null) return;
                      await createReport(
                        "comment",
                        commentReportTargetId,
                        Number(postId),
                        Number(categoryId),
                        commentReportReason,
                        commentReportReason === "기타" ? commentReportCustomReason : undefined
                      );
                      setCommentReportDone(true);
                    }}
                    className={`flex flex-1 items-center justify-center rounded-xl py-3 text-sm font-semibold text-white ${
                      commentReportReason
                        ? "bg-violet-500 hover:bg-violet-600"
                        : "cursor-not-allowed bg-zinc-300 dark:bg-zinc-600"
                    }`}
                  >
                    신고하기
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 게시글 신고 모달 */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
          <div className="w-full max-w-sm rounded-t-2xl bg-white px-6 pb-6 pt-4 shadow-xl sm:rounded-2xl dark:bg-zinc-900">
            {/* 핸들 바 */}
            <div className="mb-4 flex justify-center">
              <div className="h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-600" />
            </div>

            {reportDone ? (
              <div className="py-8 text-center">
                <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">신고가 접수되었습니다.</p>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">검토 후 조치하겠습니다.</p>
                <button
                  onClick={() => setShowReportModal(false)}
                  className="mt-6 w-full rounded-xl bg-violet-500 py-3 text-sm font-semibold text-white hover:bg-violet-600"
                >
                  확인
                </button>
              </div>
            ) : (
              <>
                <h3 className="mb-5 text-center text-base font-bold text-zinc-900 dark:text-zinc-100">
                  해당 게시글을 어떤 이유로 신고하시나요?
                </h3>

                <div className="space-y-2">
                  {["스팸/영리목적 홍보", "욕설/비하발언", "허위 정보 유포", "부적절한 콘텐츠", "기타"].map((reason) => (
                    <div key={reason}>
                      <button
                        onClick={() => {
                          setReportReason(reason);
                          if (reason !== "기타") setReportCustomReason("");
                        }}
                        className={`flex w-full items-center justify-between rounded-xl border px-4 py-3.5 text-sm transition-all ${
                          reportReason === reason
                            ? "border-violet-500 bg-violet-50 font-semibold text-zinc-900 dark:border-violet-400 dark:bg-violet-950 dark:text-zinc-100"
                            : "border-zinc-200 text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        <span>{reason}</span>
                        <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                          reportReason === reason
                            ? "border-violet-500 bg-violet-500 dark:border-violet-400 dark:bg-violet-400"
                            : "border-zinc-300 dark:border-zinc-600"
                        }`}>
                          {reportReason === reason && (
                            <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <circle cx="10" cy="10" r="4" />
                            </svg>
                          )}
                        </span>
                      </button>
                      {/* 기타 선택 시 텍스트 입력창 슬라이드 */}
                      {reason === "기타" && (
                        <div
                          className="overflow-hidden transition-all duration-300 ease-in-out"
                          style={{
                            maxHeight: reportReason === "기타" ? "150px" : "0px",
                            opacity: reportReason === "기타" ? 1 : 0,
                          }}
                        >
                          <textarea
                            value={reportCustomReason}
                            onChange={(e) => setReportCustomReason(e.target.value)}
                            placeholder="신고 사유를 입력해주세요"
                            rows={3}
                            className="mt-2 w-full resize-none rounded-xl border border-violet-300 bg-violet-50 px-4 py-3 text-sm leading-relaxed text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none dark:border-violet-700 dark:bg-violet-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex gap-3">
                  <button
                    onClick={() => setShowReportModal(false)}
                    className="flex flex-1 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  >
                    취소
                  </button>
                  <button
                    onClick={async () => {
                      if (!reportReason) return;
                      await createReport(
                        "post",
                        Number(postId),
                        Number(postId),
                        Number(categoryId),
                        reportReason,
                        reportReason === "기타" ? reportCustomReason : undefined
                      );
                      setReportDone(true);
                    }}
                    className={`flex flex-1 items-center justify-center rounded-xl py-3 text-sm font-semibold text-white ${
                      reportReason
                        ? "bg-violet-500 hover:bg-violet-600"
                        : "cursor-not-allowed bg-zinc-300 dark:bg-zinc-600"
                    }`}
                  >
                    신고하기
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
