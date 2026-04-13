"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { deletePost, likePost, viewPost, createComment, deleteComment, createReport, updateNotice, likeComment, updateComment, verifyPostPassword } from "@/app/lib/actions";
import type { Post, Comment } from "@/app/lib/types";
import { useAuth } from "@/app/components/auth-provider";
import { shareOrCopy } from "@/app/lib/share";

function formatDate(dateStr: string) {
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
  const searchParams = useSearchParams();
  const { user, nickname, getIdToken } = useAuth();
  const categoryId = params.id as string;
  const postId = params.postId as string;

  // 뒤로가기 타겟: from 쿼리가 있으면 그곳으로, 없으면 해당 카테고리 게시판으로
  const fromParam = searchParams.get("from");
  const backHref = fromParam && fromParam.startsWith("/") ? fromParam : `/category/${categoryId}`;

  // 특정 댓글 하이라이트: ?hc=<commentId>
  const hcParam = searchParams.get("hc");
  const [highlightCommentId, setHighlightCommentId] = useState<number | null>(null);

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
  const [commentAuthor, setCommentAuthor] = useState(nickname || "");
  const [commentPassword, setCommentPassword] = useState("");
  const [commentContent, setCommentContent] = useState("");
  const [commentError, setCommentError] = useState("");

  // 댓글 정렬
  const [commentSort, setCommentSort] = useState<"newest" | "popular" | "likes">("newest");

  // 댓글 공감 처리된 ID
  const [likedCommentIds, setLikedCommentIds] = useState<Set<number>>(new Set());

  // 답글
  const [replyTargetId, setReplyTargetId] = useState<number | null>(null);

  // 북마크
  const [bookmarked, setBookmarked] = useState(false);

  // 공유 토스트
  const [shareToast, setShareToast] = useState<string | null>(null);

  const handleShare = async () => {
    if (!post) return;
    const result = await shareOrCopy({
      title: post.title,
      text: `"${post.title}"\n\n모두의 지도사 커뮤니티에서 보기`,
      url: `https://moducm.com/category/${categoryId}/post/${post.id}`,
    });
    if (result === "copied") {
      setShareToast("링크가 복사되었습니다");
      setTimeout(() => setShareToast(null), 2000);
    }
  };

  // 관리자
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminDeleteModal, setShowAdminDeleteModal] = useState(false);
  const [adminDeleting, setAdminDeleting] = useState(false);

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

  // 닉네임 로드 시 댓글 작성자 자동 입력
  useEffect(() => {
    if (nickname && !commentAuthor) setCommentAuthor(nickname);
  }, [nickname]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/post/${postId}`).then((r) => r.json()),
      fetch(`/api/post/${postId}/comments`).then((r) => r.json()),
    ]).then(([postData, commentsData]) => {
      setPost(postData);
      setLikes(Number(postData?.likes ?? 0));
      if (postData?.is_liked) setLiked(true);
      const likedIds = (commentsData ?? []).filter((c: { is_liked?: boolean }) => c.is_liked).map((c: { id: number }) => c.id);
      if (likedIds.length > 0) setLikedCommentIds(new Set(likedIds));
      setComments(commentsData ?? []);
      setLoading(false);
      viewPost(Number(postId));

      // ?hc=<commentId> 처리: 해당 댓글로 스크롤 + 깜빡 효과
      if (hcParam) {
        const id = Number(hcParam);
        if (!Number.isNaN(id)) {
          setHighlightCommentId(id);
          // 렌더 후 스크롤 (렌더 완료 대기)
          setTimeout(() => {
            const el = document.getElementById(`comment-${id}`);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 120);
        }
      }
    }).catch(() => setLoading(false));

    // 북마크 상태 로드
    fetch(`/api/posts/${postId}/bookmark`)
      .then((r) => r.json())
      .then((data) => { if (data.bookmarked) setBookmarked(true); })
      .catch(() => {});
  }, [postId]);

  // 하이라이트 댓글 자동 해제 (애니메이션 종료 시점)
  useEffect(() => {
    if (highlightCommentId == null) return;
    const t = setTimeout(() => setHighlightCommentId(null), 1800);
    return () => clearTimeout(t);
  }, [highlightCommentId]);

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

  // 관리자 여부 체크
  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    getIdToken().then(token => {
      if (!token) return;
      fetch("/api/auth/is-admin", { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => setIsAdmin(!!d.isAdmin))
        .catch(() => {});
    });
  }, [user, getIdToken]);

  // 관리자 삭제
  async function handleAdminDelete() {
    setAdminDeleting(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/post/${postId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ password: "__admin_uid_delete__" }),
      });
      if (res.ok) {
        router.replace(`/category/${categoryId}`);
      }
    } catch {}
    setAdminDeleting(false);
  }

  async function handleLike() {
    if (!user) { alert("로그인 후 이용 가능합니다"); return; }
    const token = await getIdToken();
    if (!token) { alert("로그인이 필요합니다"); return; }
    // 낙관적 업데이트: 즉시 UI 반영
    const wasLiked = liked;
    const prevLikes = likes;
    setLiked(!wasLiked);
    setLikes(wasLiked ? Math.max(prevLikes - 1, 0) : prevLikes + 1);
    // 서버 호출 (백그라운드)
    const result = await likePost(Number(postId), Number(categoryId), token);
    if (result && "error" in result && result.error) {
      // 롤백
      setLiked(wasLiked);
      setLikes(prevLikes);
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
    if (!user) { alert("로그인 후 이용 가능합니다"); return; }
    if (!commentContent.trim()) {
      setCommentError("댓글 내용을 입력해주세요");
      return;
    }
    const token = await getIdToken();
    if (!token) { setCommentError("로그인이 필요합니다"); return; }
    // 작성자는 로그인 닉네임/이름/이메일에서 자동으로, 비밀번호는 레거시 플레이스홀더
    const author = (nickname || user.displayName || user.email || "익명").toString().trim();
    const result = await createComment(Number(postId), Number(categoryId), author, "__auth__", commentContent, replyTargetId, token);
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

  // 본인/관리자: Firebase 인증 토큰으로 직접 REST PUT
  async function handleOwnerCommentEditSave(commentId: number) {
    if (!editCommentContent.trim()) {
      setEditCommentError("내용을 입력해주세요");
      return;
    }
    try {
      const token = await getIdToken();
      if (!token) { setEditCommentError("로그인이 필요합니다"); return; }
      const res = await fetch(`/api/comments/${commentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: editCommentContent.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setEditCommentError(data.error || "수정에 실패했습니다"); return; }
      setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, content: editCommentContent.trim() } : c));
      setEditingCommentId(null);
      setEditCommentContent("");
      setEditCommentError("");
      setEditCommentPasswordVerified(false);
    } catch {
      setEditCommentError("오류가 발생했습니다");
    }
  }

  // 본인/관리자: Firebase 인증 토큰으로 직접 REST DELETE
  async function handleOwnerCommentDelete(commentId: number) {
    try {
      const token = await getIdToken();
      if (!token) { setCommentDeleteError("로그인이 필요합니다"); return; }
      const res = await fetch(`/api/comments/${commentId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ post_id: Number(postId) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setCommentDeleteError(data.error || "삭제에 실패했습니다"); return; }
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setDeletingCommentId(null);
      setCommentDeleteError("");
    } catch {
      setCommentDeleteError("오류가 발생했습니다");
    }
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
      <div className="flex min-h-screen items-center justify-center bg-[#F8F4EC] dark:bg-zinc-950">
        <div className="w-7 h-7 border-2 border-[#6B7B3A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F4EC] dark:bg-zinc-950">
        <p className="text-sm text-[#8C8270]">게시글을 찾을 수 없습니다.</p>
      </div>
    );
  }

  const tags = post.tags ? post.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
  const regionParts: string[] = (() => {
    if (!post.region || post.region === "전국") return [];
    return post.region.split(/\s*-\s*/).map((p) => p.trim()).filter(Boolean);
  })();

  const inputCls = "w-full rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB] dark:bg-zinc-800 px-4 py-3 text-[14px] text-[#2A251D] dark:text-zinc-100 placeholder:text-[#A89B80] focus:border-[#6B7B3A]/50 focus:bg-[#FEFCF7] focus:outline-none transition-colors";
  const smallInputCls = "flex-1 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB] dark:bg-zinc-800 px-3 py-2 text-[13px] text-[#2A251D] dark:text-zinc-100 placeholder:text-[#A89B80] focus:border-[#6B7B3A]/50 focus:bg-[#FEFCF7] focus:outline-none transition-colors";

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F4EC] dark:bg-zinc-950 pb-10">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col md:max-w-3xl lg:max-w-4xl px-4 sm:px-6 py-4 sm:py-6 gap-4">

        {/* ═══ 상단 바 ═══ */}
        <header className="sticky top-14 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-[#F8F4EC]/85 dark:bg-zinc-950/85 backdrop-blur-md border-b border-[#E8E0D0]/70 dark:border-zinc-800">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 -ml-1 px-1 py-0.5 rounded-lg text-[#6B7B3A] hover:bg-[#F5F0E5]/60 dark:hover:bg-zinc-800 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-[11px] font-bold tracking-[0.15em] uppercase">
              {fromParam && fromParam.startsWith("/my") ? "MY 페이지" : (post?.category_name ? `${post.category_name} Board` : "Board")}
            </span>
          </Link>
        </header>

        {/* ═══ 히어로 카드: 태그·제목·메타 ═══ */}
        <section className="relative bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-6 sm:p-8 shadow-[0_1px_0_rgba(0,0,0,0.02),0_12px_32px_-20px_rgba(107,93,71,0.2)]">
          {/* 장식 요소 전용 클리핑 래퍼 (드롭다운이 카드 밖으로 빠져나갈 수 있도록 overflow-hidden 을 여기에만 적용) */}
          <div aria-hidden className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
            <div className="absolute -top-20 -right-16 w-56 h-56 rounded-full bg-[#6B7B3A]/[0.05] blur-3xl" />
            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/30 to-transparent" />
          </div>

          <div className="relative">
            {/* 태그 + 지역 뱃지 */}
            {(tags.length > 0 || regionParts.length > 0 || post.is_notice) && (
              <div className="mb-4 flex flex-wrap items-center gap-1.5">
                {post.is_notice && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#C0392B]/10 text-[#C0392B] text-[10px] font-bold tracking-wider uppercase">
                    공지
                  </span>
                )}
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#EFE7D5] dark:bg-[#6B7B3A]/20 text-[#6B7B3A] dark:text-[#A8B87A] text-[11px] font-semibold"
                  >
                    {tag}
                  </span>
                ))}
                {regionParts.map((part) => (
                  <span
                    key={part}
                    className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#F5F0E5] dark:bg-zinc-800 border border-[#E8E0D0]/60 dark:border-zinc-700 text-[#6B5D47] dark:text-zinc-400 text-[11px] font-medium"
                  >
                    {part}
                  </span>
                ))}
              </div>
            )}

            {/* 제목 */}
            {isNoticeEditing ? (
              <input
                value={noticeEditTitle}
                onChange={(e) => setNoticeEditTitle(e.target.value)}
                className="w-full rounded-xl border border-[#6B7B3A]/40 bg-[#FBF7EB] dark:bg-zinc-800 px-4 py-3 text-[22px] sm:text-[26px] font-bold text-[#2A251D] dark:text-zinc-100 focus:border-[#6B7B3A]/70 focus:outline-none"
              />
            ) : (
              <h1 className="text-[22px] sm:text-[26px] font-bold text-[#2A251D] dark:text-zinc-100 leading-tight tracking-tight">
                {post.title}
              </h1>
            )}

            {/* 메타 */}
            <div className="mt-4 flex items-center gap-2 flex-wrap text-[12px] text-[#8C8270] dark:text-zinc-500 pt-4 border-t border-[#E8E0D0]/60 dark:border-zinc-800">
              <span className="inline-flex items-center gap-1">
                <span className="font-semibold text-[#3A342A] dark:text-zinc-200">{post.author}</span>
                {post.ip_display && <span className="text-[#A89B80]">({post.ip_display})</span>}
              </span>
              <span className="text-[#C7B89B]">·</span>
              <span>{formatDate(post.created_at)}</span>
              <span className="text-[#C7B89B]">·</span>
              <span className="inline-flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
                조회 {post.views}
              </span>
              {/* ··· 더보기 메뉴 (본인 또는 관리자만 노출) */}
              {!post.is_notice && (post.is_mine || isAdmin) && (
                <div className="relative ml-auto">
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowPostMenu(!showPostMenu); }}
                    aria-label="더보기"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-[#8C8270] hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors"
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <circle cx="4" cy="10" r="1.5" />
                      <circle cx="10" cy="10" r="1.5" />
                      <circle cx="16" cy="10" r="1.5" />
                    </svg>
                  </button>
                  {showPostMenu && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 top-8 z-30 min-w-[112px] overflow-hidden rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800 shadow-[0_12px_32px_-16px_rgba(107,93,71,0.3)]"
                    >
                      <button
                        onClick={() => {
                          setShowPostMenu(false);
                          // 본인 또는 관리자 → 비밀번호 없이 수정 페이지로 이동
                          router.push(`/category/${categoryId}/post/${postId}/edit`);
                        }}
                        className="flex w-full items-center px-4 py-2.5 text-[12px] font-semibold text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-700 transition-colors"
                      >
                        수정
                      </button>
                      <hr className="border-[#E8E0D0]/70 dark:border-zinc-700" />
                      <button
                        onClick={() => {
                          setShowPostMenu(false);
                          // 본인 또는 관리자 → 비밀번호 없이 삭제 확인 모달
                          setShowAdminDeleteModal(true);
                        }}
                        className="flex w-full items-center px-4 py-2.5 text-[12px] font-semibold text-[#C0392B] hover:bg-[#F5F0E5] dark:hover:bg-zinc-700 transition-colors"
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ═══ 본문 카드 ═══ */}
        <section className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-6 sm:p-8">
          {isNoticeEditing ? (
            <textarea
              value={noticeEditContent}
              onChange={(e) => setNoticeEditContent(e.target.value)}
              rows={12}
              className="w-full resize-none rounded-2xl border border-[#6B7B3A]/40 bg-[#FBF7EB] dark:bg-zinc-800 px-4 py-3 text-[15px] leading-[1.85] text-[#2A251D] dark:text-zinc-100 focus:border-[#6B7B3A]/70 focus:outline-none"
            />
          ) : (
            <div className="whitespace-pre-wrap text-[15px] leading-[1.85] text-[#3A342A] dark:text-zinc-200">
              {post.content}
            </div>
          )}
        </section>

        {/* ═══ 액션 바 ═══ */}
        <div className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl px-4 sm:px-5 py-3">
          {/* 모바일 전용 */}
          <div className="sm:hidden space-y-2">
            <button
              onClick={() => { setShowReportModal(true); setReportReason(""); setReportCustomReason(""); setReportDone(false); }}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB] dark:bg-zinc-800 px-3 py-2.5 text-[12px] font-semibold text-[#C0392B] hover:bg-[#F8EEE9] dark:hover:bg-zinc-700 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>신고하기</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={async () => {
                  const token = localStorage.getItem("fb_token");
                  const res = await fetch(`/api/posts/${postId}/bookmark`, {
                    method: "POST",
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                  });
                  if (res.ok) setBookmarked(!bookmarked);
                }}
                className={`min-w-0 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[12px] font-semibold transition-all ${
                  bookmarked
                    ? "bg-[#6B7B3A] text-white shadow-[0_2px_8px_-2px_rgba(107,123,58,0.4)]"
                    : "border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB] dark:bg-zinc-800 text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5]/70 dark:hover:bg-zinc-700"
                }`}
              >
                <svg className="h-4 w-4 shrink-0" fill={bookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                <span className="truncate">북마크</span>
              </button>
              <button
                onClick={handleShare}
                aria-label="공유하기"
                className="min-w-0 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB] dark:bg-zinc-800 px-3 py-2.5 text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5]/70 dark:hover:bg-zinc-700 transition-colors"
              >
                <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                <span className="truncate">공유</span>
              </button>
              <button
                onClick={handleLike}
                className={`min-w-0 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[12px] font-semibold transition-all ${
                  liked
                    ? "bg-[#6B7B3A] text-white shadow-[0_2px_8px_-2px_rgba(107,123,58,0.4)]"
                    : "border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB] dark:bg-zinc-800 text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5]/70 dark:hover:bg-zinc-700"
                }`}
              >
                <svg className="h-4 w-4 shrink-0" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                </svg>
                <span className="truncate">좋아요 {likes}</span>
              </button>
              <button
                onClick={() => { setReplyTargetId(null); setShowCommentForm(!showCommentForm); }}
                className="min-w-0 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB] dark:bg-zinc-800 px-3 py-2.5 text-[12px] font-bold text-[#3A342A] dark:text-zinc-100 hover:bg-[#F5F0E5]/70 dark:hover:bg-zinc-700 transition-colors"
              >
                <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span className="truncate">댓글달기</span>
              </button>
            </div>
          </div>

          {/* 데스크톱 유지 */}
          <div className="hidden sm:flex items-center">
            <button
              onClick={() => { setShowReportModal(true); setReportReason(""); setReportCustomReason(""); setReportDone(false); }}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#C0392B] hover:text-[#A0311F] transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>신고</span>
            </button>
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={async () => {
                  const token = localStorage.getItem("fb_token");
                  const res = await fetch(`/api/posts/${postId}/bookmark`, {
                    method: "POST",
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                  });
                  if (res.ok) setBookmarked(!bookmarked);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${
                  bookmarked
                    ? "bg-[#6B7B3A] text-white shadow-[0_2px_8px_-2px_rgba(107,123,58,0.4)]"
                    : "text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5]/70 dark:hover:bg-zinc-800"
                }`}
              >
                <svg className="h-4 w-4" fill={bookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                <span>북마크</span>
              </button>
              <button
                onClick={handleShare}
                aria-label="공유하기"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5]/70 dark:hover:bg-zinc-800 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                <span>공유</span>
              </button>
              <button
                onClick={handleLike}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${
                  liked
                    ? "bg-[#6B7B3A] text-white shadow-[0_2px_8px_-2px_rgba(107,123,58,0.4)]"
                    : "text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5]/70 dark:hover:bg-zinc-800"
                }`}
              >
                <svg className="h-4 w-4" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                </svg>
                <span>좋아요 {likes}</span>
              </button>
              <button
                onClick={() => { setReplyTargetId(null); setShowCommentForm(!showCommentForm); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold text-[#3A342A] dark:text-zinc-100 hover:bg-[#F5F0E5]/70 dark:hover:bg-zinc-800 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span>댓글달기</span>
              </button>
            </div>
          </div>
        </div>

        {/* ═══ 댓글 섹션 ═══ */}
        <section className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-5 sm:p-6">
          {/* 전체 댓글 N개 + 정렬 */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-[#6B7B3A]" />
              <span className="text-[14px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight">
                전체 댓글 <span className="text-[#6B7B3A]">{comments.length}</span>개
              </span>
            </div>
            <div className="ml-auto flex items-center gap-0.5 text-[11px] bg-[#F5F0E5]/60 dark:bg-zinc-800 p-0.5 rounded-lg">
              {[
                { key: "newest", label: "최신순" },
                { key: "popular", label: "인기순" },
                { key: "likes", label: "공감순" },
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setCommentSort(opt.key as "newest" | "popular" | "likes")}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    commentSort === opt.key
                      ? "bg-[#FEFCF7] dark:bg-zinc-900 text-[#6B7B3A] shadow-[0_1px_4px_-1px_rgba(107,93,71,0.2)]"
                      : "text-[#8C8270] hover:text-[#3A342A] dark:hover:text-zinc-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 댓글 작성 폼 (새 댓글) */}
          {showCommentForm && !replyTargetId && (
            <div className="mt-4 rounded-2xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB]/60 dark:bg-zinc-800/60 p-4">
              <textarea
                value={commentContent}
                onChange={(e) => setCommentContent(e.target.value)}
                placeholder="댓글을 입력하세요"
                rows={3}
                className="w-full resize-none rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800 px-3 py-2 text-[13px] leading-relaxed text-[#2A251D] dark:text-zinc-100 placeholder:text-[#A89B80] focus:border-[#6B7B3A]/50 focus:outline-none transition-colors"
              />
              {commentError && (
                <p className="mt-2 text-[11px] text-[#C0392B]">{commentError}</p>
              )}
              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={() => { setShowCommentForm(false); setCommentError(""); }}
                  className="rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800 px-4 py-2 text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-700 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleCommentSubmit}
                  className="rounded-lg bg-[#6B7B3A] hover:bg-[#5A6930] px-4 py-2 text-[12px] font-bold text-white shadow-[0_2px_8px_-2px_rgba(107,123,58,0.4)] transition-colors"
                >
                  등록
                </button>
              </div>
            </div>
          )}

          {/* 댓글 목록 */}
          <div className="mt-4 space-y-0 divide-y divide-[#E8E0D0]/50 dark:divide-zinc-800">
            {comments.length === 0 && !showCommentForm && (
              <div className="py-10 text-center">
                <div className="inline-flex w-12 h-12 mb-3 rounded-2xl bg-[#F5F0E5] dark:bg-zinc-800 items-center justify-center">
                  <svg className="w-6 h-6 text-[#A89B80]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                  </svg>
                </div>
                <p className="text-[13px] text-[#8C8270]">아직 댓글이 없습니다</p>
                <p className="text-[11px] text-[#A89B80] mt-0.5">첫 댓글을 남겨보세요</p>
              </div>
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
                const isHighlighted = highlightCommentId === comment.id;

                return (
                  <div
                    key={comment.id}
                    id={`comment-${comment.id}`}
                    className={`${isReply ? "border-l-2 border-[#6B7B3A]/25 pl-4" : ""} ${isHighlighted ? "comment-blink rounded-xl" : ""}`}
                  >
                    <div className="py-3.5">
                      <div className="flex items-start gap-3">
                        {/* 왼쪽: 닉네임 + 내용 + 날짜/답글쓰기/신고 */}
                        <div className="min-w-0 flex-1">
                          {/* 닉네임 + IP */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[13px] font-bold text-[#2A251D] dark:text-zinc-100">
                              {comment.author}
                            </span>
                            {comment.ip_display && (
                              <span className="text-[11px] text-[#A89B80]">({comment.ip_display})</span>
                            )}
                          </div>
                          {/* 댓글 내용 */}
                          <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-[#3A342A] dark:text-zinc-300">
                            {comment.content}
                          </p>
                          {/* 날짜 + 답글쓰기 + 신고 */}
                          <div className="mt-2 flex items-center gap-3 text-[11px]">
                            <span className="text-[#A89B80]">
                              {formatDate(comment.created_at)}
                            </span>
                            <button
                              onClick={() => {
                                setReplyTargetId(replyTargetId === comment.id ? null : comment.id);
                                setShowCommentForm(false);
                                setCommentContent("");
                                setCommentError("");
                              }}
                              className="font-semibold text-[#6B7B3A] dark:text-[#A8B87A] hover:text-[#5A6930]"
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
                              className="font-medium text-[#C0392B] hover:text-[#A0311F]"
                            >
                              신고
                            </button>
                          </div>
                        </div>

                        {/* 오른쪽: ··· 버튼 + 하트 */}
                        <div className="relative flex shrink-0 flex-col items-center gap-1 pt-0.5">
                          {(comment.is_mine || isAdmin) && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); setMenuOpenCommentId(menuOpenCommentId === comment.id ? null : comment.id); }}
                                aria-label="더보기"
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-[#A89B80] hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors"
                              >
                                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                                  <circle cx="4" cy="10" r="1.5" />
                                  <circle cx="10" cy="10" r="1.5" />
                                  <circle cx="16" cy="10" r="1.5" />
                                </svg>
                              </button>
                              {menuOpenCommentId === comment.id && (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute right-0 top-8 z-30 min-w-[112px] overflow-hidden rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800 shadow-[0_12px_32px_-16px_rgba(107,93,71,0.3)]"
                                >
                                  <button
                                    onClick={() => {
                                      setMenuOpenCommentId(null);
                                      // 본인/관리자: 비밀번호 단계 건너뛰고 바로 편집 모드로
                                      setEditingCommentId(comment.id);
                                      setEditCommentContent(comment.content);
                                      setEditCommentError("");
                                      setEditCommentPasswordVerified(true);
                                      setEditCommentPassword("");
                                    }}
                                    className="flex w-full items-center px-3.5 py-2 text-[12px] font-semibold text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-700"
                                  >
                                    수정
                                  </button>
                                  <hr className="border-[#E8E0D0]/70 dark:border-zinc-700" />
                                  <button
                                    onClick={() => {
                                      setMenuOpenCommentId(null);
                                      // 본인/관리자: 비밀번호 없이 삭제 확인 모드로
                                      setDeletingCommentId(comment.id);
                                      setCommentDeleteError("");
                                    }}
                                    className="flex w-full items-center px-3.5 py-2 text-[12px] font-semibold text-[#C0392B] hover:bg-[#F5F0E5] dark:hover:bg-zinc-700"
                                  >
                                    삭제
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                          <button
                            onClick={async () => {
                              if (!user) { alert("로그인 후 이용 가능합니다"); return; }
                              const token = await getIdToken();
                              if (!token) { alert("로그인이 필요합니다"); return; }
                              const wasLiked = likedCommentIds.has(comment.id);
                              const prevLikes = comment.likes ?? 0;
                              // 낙관적 업데이트: 즉시 UI 반영
                              if (wasLiked) {
                                setLikedCommentIds((prev) => { const s = new Set(prev); s.delete(comment.id); return s; });
                                setComments((prev) => prev.map((c) => c.id === comment.id ? { ...c, likes: Math.max(prevLikes - 1, 0) } : c));
                              } else {
                                setLikedCommentIds((prev) => new Set(prev).add(comment.id));
                                setComments((prev) => prev.map((c) => c.id === comment.id ? { ...c, likes: prevLikes + 1 } : c));
                              }
                              // 서버 호출 (백그라운드) — 실패 시 롤백
                              const result = await likeComment(comment.id, Number(postId), Number(categoryId), token) as { unliked?: boolean; error?: string } | undefined;
                              if (result?.error) {
                                // 롤백
                                if (wasLiked) {
                                  setLikedCommentIds((prev) => new Set(prev).add(comment.id));
                                  setComments((prev) => prev.map((c) => c.id === comment.id ? { ...c, likes: prevLikes } : c));
                                } else {
                                  setLikedCommentIds((prev) => { const s = new Set(prev); s.delete(comment.id); return s; });
                                  setComments((prev) => prev.map((c) => c.id === comment.id ? { ...c, likes: prevLikes } : c));
                                }
                              }
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors"
                          >
                            <svg className="h-[18px] w-[18px]" fill={likedCommentIds.has(comment.id) ? "#C75555" : "none"} stroke="#C75555" strokeWidth={1.8} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                            </svg>
                          </button>
                          {(comment.likes ?? 0) > 0 && (
                            <span className="text-[11px] font-bold text-[#C75555]">{comment.likes}</span>
                          )}
                        </div>
                      </div>

                      {/* 댓글 수정 (본인/관리자: 비밀번호 없이 바로 편집) */}
                      {editingCommentId === comment.id && (
                        <div className="mt-3 space-y-2">
                          <textarea
                            value={editCommentContent}
                            onChange={(e) => setEditCommentContent(e.target.value)}
                            rows={3}
                            className="w-full resize-none rounded-lg border border-[#6B7B3A]/40 bg-[#FBF7EB] dark:bg-zinc-800 px-3 py-2 text-[13px] leading-relaxed text-[#2A251D] dark:text-zinc-100 placeholder:text-[#A89B80] focus:border-[#6B7B3A]/70 focus:outline-none"
                            autoFocus
                          />
                          {editCommentError && <p className="text-[11px] text-[#C0392B]">{editCommentError}</p>}
                          <div className="flex justify-end gap-2">
                            <button onClick={() => { setEditingCommentId(null); setEditCommentPasswordVerified(false); setEditCommentError(""); }} className="rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800 px-3 py-2 text-[12px] text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5]">취소</button>
                            <button onClick={() => handleOwnerCommentEditSave(comment.id)} className="rounded-lg bg-[#6B7B3A] hover:bg-[#5A6930] px-3 py-2 text-[12px] font-semibold text-white shadow-[0_2px_8px_-2px_rgba(107,123,58,0.4)]">저장</button>
                          </div>
                        </div>
                      )}

                      {/* 댓글 삭제 확인 (본인/관리자: 비밀번호 없이 확인만) */}
                      {deletingCommentId === comment.id && (
                        <div className="mt-3 rounded-xl border border-[#C0392B]/30 bg-[#FBEFEC] dark:bg-[#2A1A17] px-3 py-2.5">
                          <div className="flex items-start gap-2 mb-2">
                            <svg className="w-4 h-4 text-[#C0392B] shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <div>
                              <p className="text-[12px] font-bold text-[#8A2A1E] dark:text-[#E8A095]">정말 삭제하시겠습니까?</p>
                              <p className="text-[11px] text-[#8C8270] dark:text-zinc-500 mt-0.5">삭제된 댓글은 복구할 수 없습니다.</p>
                            </div>
                          </div>
                          {commentDeleteError && <p className="text-[11px] text-[#C0392B] mb-2">{commentDeleteError}</p>}
                          <div className="flex justify-end gap-2">
                            <button onClick={() => { setDeletingCommentId(null); setCommentDeleteError(""); }} className="rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800 px-3 py-1.5 text-[12px] text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5]">취소</button>
                            <button onClick={() => handleOwnerCommentDelete(comment.id)} className="rounded-lg bg-[#C0392B] hover:bg-[#A0311F] px-3 py-1.5 text-[12px] font-semibold text-white">삭제</button>
                          </div>
                        </div>
                      )}

                      {/* 답글 작성 폼 (인라인) */}
                      {replyTargetId === comment.id && (
                        <div className="mt-3 rounded-2xl border border-[#6B7B3A]/30 bg-[#FBF7EB]/60 dark:bg-[#6B7B3A]/10 p-3">
                          <div className="mb-2 flex items-center gap-2">
                            <span className="text-[11px] font-bold text-[#6B7B3A] dark:text-[#A8B87A]">
                              @{comment.author} 에게 답글
                            </span>
                            <button onClick={() => { setReplyTargetId(null); setCommentError(""); }} className="text-[11px] text-[#A89B80] hover:text-[#6B5D47]">✕</button>
                          </div>
                          <textarea
                            value={commentContent}
                            onChange={(e) => setCommentContent(e.target.value)}
                            placeholder="답글을 입력하세요"
                            rows={2}
                            className="w-full resize-none rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800 px-3 py-2 text-[13px] leading-relaxed text-[#2A251D] dark:text-zinc-100 placeholder:text-[#A89B80] focus:border-[#6B7B3A]/50 focus:outline-none"
                            autoFocus
                          />
                          {commentError && (
                            <p className="mt-1 text-[11px] text-[#C0392B]">{commentError}</p>
                          )}
                          <div className="mt-2 flex justify-end gap-2">
                            <button
                              onClick={() => { setReplyTargetId(null); setCommentError(""); }}
                              className="rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800 px-3 py-2 text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5]"
                            >
                              취소
                            </button>
                            <button
                              onClick={handleCommentSubmit}
                              className="rounded-lg bg-[#6B7B3A] hover:bg-[#5A6930] px-3 py-2 text-[12px] font-bold text-white shadow-[0_2px_8px_-2px_rgba(107,123,58,0.4)]"
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
        </section>

        {/* Bottom Actions (공지 전용) */}
        {post.is_notice && (
          <div className="flex items-center justify-between bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl px-5 py-4">
            {isNoticeEditing ? (
              <>
                <button
                  onClick={() => { setIsNoticeEditing(false); setNoticeAdminPassword(""); }}
                  className="rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800 px-5 py-2.5 text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-700"
                >
                  취소
                </button>
                <button
                  onClick={handleNoticeSave}
                  className="rounded-xl bg-[#6B7B3A] hover:bg-[#5A6930] px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)]"
                >
                  저장
                </button>
              </>
            ) : (
              <button
                onClick={() => { setShowNoticePasswordModal(true); setNoticeAdminPassword(""); setNoticePasswordError(""); }}
                className="ml-auto rounded-xl bg-[#6B7B3A] hover:bg-[#5A6930] px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)]"
              >
                수정하기
              </button>
            )}
          </div>
        )}
      </div>

      {/* ══════ 모달들 ══════ */}

      {/* 수정 비밀번호 모달 */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-[#2A251D]/50 backdrop-blur-sm" onClick={() => setShowEditModal(false)} />
          <div className="relative w-full max-w-sm bg-[#FEFCF7] dark:bg-zinc-900 rounded-3xl shadow-2xl border border-[#E8E0D0] dark:border-zinc-700 p-6 overflow-hidden">
            <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/40 to-transparent" />
            <h3 className="mb-2 text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight">
              게시글 수정
            </h3>
            <p className="mb-4 text-[12px] text-[#8C8270] dark:text-zinc-500">
              수정하려면 비밀번호를 입력해주세요.
            </p>
            <input
              type="password"
              value={editPassword}
              onChange={(e) => { setEditPassword(e.target.value); setEditError(""); }}
              placeholder="비밀번호 입력"
              className={`mb-3 ${inputCls}`}
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
              <p className="mb-3 text-[12px] text-[#C0392B]">{editError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex flex-1 items-center justify-center rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800 py-3 text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-700"
              >
                취소
              </button>
              <button
                onClick={async () => {
                  const result = await verifyPostPassword(Number(postId), editPassword);
                  if (result?.error) { setEditError(result.error); return; }
                  router.push(`/category/${categoryId}/post/${postId}/edit`);
                }}
                className="flex flex-1 items-center justify-center rounded-xl bg-[#6B7B3A] hover:bg-[#5A6930] py-3 text-[13px] font-bold text-white shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)]"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 비밀번호 모달 */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-[#2A251D]/50 backdrop-blur-sm" onClick={() => setShowDeleteModal(false)} />
          <div className="relative w-full max-w-sm bg-[#FEFCF7] dark:bg-zinc-900 rounded-3xl shadow-2xl border border-[#E8E0D0] dark:border-zinc-700 p-6 overflow-hidden">
            <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#C0392B]/40 to-transparent" />
            <h3 className="mb-2 text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight">
              게시글 삭제
            </h3>
            <p className="mb-4 text-[12px] text-[#8C8270] dark:text-zinc-500">
              삭제하려면 비밀번호를 입력해주세요.
            </p>
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(""); }}
              placeholder="비밀번호 입력"
              className={`mb-3 ${inputCls}`}
              onKeyDown={(e) => { if (e.key === "Enter") handleDelete(); }}
              autoFocus
            />
            {deleteError && (
              <p className="mb-3 text-[12px] text-[#C0392B]">{deleteError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex flex-1 items-center justify-center rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800 py-3 text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-700"
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                className="flex flex-1 items-center justify-center rounded-xl bg-[#C0392B] hover:bg-[#A0311F] py-3 text-[13px] font-bold text-white shadow-[0_4px_14px_-4px_rgba(192,57,43,0.4)]"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 관리자 삭제 확인 모달 */}
      {showAdminDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-[#2A251D]/50 backdrop-blur-sm" onClick={() => setShowAdminDeleteModal(false)} />
          <div className="relative w-full max-w-sm bg-[#FEFCF7] dark:bg-zinc-900 rounded-3xl shadow-2xl border border-[#E8E0D0] dark:border-zinc-700 p-6 overflow-hidden">
            <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#C0392B]/40 to-transparent" />
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-flex w-9 h-9 items-center justify-center rounded-xl bg-[#C0392B]/10">
                <svg className="w-5 h-5 text-[#C0392B]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </span>
              <h3 className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight">게시글 삭제</h3>
            </div>
            <p className="mb-5 text-[13px] text-[#3A342A] dark:text-zinc-300">
              정말 삭제하시겠습니까?<br /><span className="text-[12px] text-[#8C8270]">삭제된 글은 복구할 수 없습니다.</span>
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowAdminDeleteModal(false)} disabled={adminDeleting}
                className="flex flex-1 items-center justify-center rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800 py-3 text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-700">
                취소
              </button>
              <button onClick={handleAdminDelete} disabled={adminDeleting}
                className="flex flex-1 items-center justify-center rounded-xl bg-[#C0392B] hover:bg-[#A0311F] py-3 text-[13px] font-bold text-white shadow-[0_4px_14px_-4px_rgba(192,57,43,0.4)] disabled:opacity-50">
                {adminDeleting ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 공지 수정 비밀번호 모달 */}
      {showNoticePasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-[#2A251D]/50 backdrop-blur-sm" onClick={() => setShowNoticePasswordModal(false)} />
          <div className="relative w-full max-w-sm bg-[#FEFCF7] dark:bg-zinc-900 rounded-3xl shadow-2xl border border-[#E8E0D0] dark:border-zinc-700 p-6 overflow-hidden">
            <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/40 to-transparent" />
            <h3 className="mb-2 text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight">
              공지 수정
            </h3>
            <p className="mb-4 text-[12px] text-[#8C8270] dark:text-zinc-500">
              관리자 비밀번호를 입력해주세요.
            </p>
            <input
              type="password"
              value={noticeAdminPassword}
              onChange={(e) => { setNoticeAdminPassword(e.target.value); setNoticePasswordError(""); }}
              placeholder="관리자 비밀번호 입력"
              className={`mb-3 ${inputCls}`}
              onKeyDown={(e) => { if (e.key === "Enter") handleNoticePasswordSubmit(); }}
              autoFocus
            />
            {noticePasswordError && (
              <p className="mb-3 text-[12px] text-[#C0392B]">{noticePasswordError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowNoticePasswordModal(false)}
                className="flex flex-1 items-center justify-center rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800 py-3 text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-700"
              >
                취소
              </button>
              <button
                onClick={handleNoticePasswordSubmit}
                className="flex flex-1 items-center justify-center rounded-xl bg-[#6B7B3A] hover:bg-[#5A6930] py-3 text-[13px] font-bold text-white shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)]"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 댓글 신고 모달 */}
      {showCommentReportModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4">
          <div className="absolute inset-0 bg-[#2A251D]/50 backdrop-blur-sm" onClick={() => setShowCommentReportModal(false)} />
          <div className="relative w-full max-w-sm bg-[#FEFCF7] dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-[#E8E0D0] dark:border-zinc-700 px-6 pb-6 pt-4 overflow-hidden">
            <div className="mb-4 flex justify-center sm:hidden">
              <div className="h-1 w-10 rounded-full bg-[#E8E0D0] dark:bg-zinc-600" />
            </div>
            <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#C0392B]/40 to-transparent" />

            {commentReportDone ? (
              <div className="py-8 text-center">
                <p className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight">신고가 접수되었습니다</p>
                <p className="mt-2 text-[13px] text-[#8C8270] dark:text-zinc-400">검토 후 조치하겠습니다</p>
                <button
                  onClick={() => setShowCommentReportModal(false)}
                  className="mt-6 w-full rounded-xl bg-[#6B7B3A] hover:bg-[#5A6930] py-3 text-[13px] font-bold text-white shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)]"
                >
                  확인
                </button>
              </div>
            ) : (
              <>
                <h3 className="mb-5 text-center text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight">
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
                        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-[13px] transition-all ${
                          commentReportReason === reason
                            ? "border-[#6B7B3A] bg-[#F5F0E5] font-semibold text-[#2A251D] dark:bg-[#6B7B3A]/20 dark:text-zinc-100"
                            : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB]/40 dark:bg-zinc-800/40 text-[#3A342A] dark:text-zinc-300 hover:border-[#6B7B3A]/40"
                        }`}
                      >
                        <span>{reason}</span>
                        <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                          commentReportReason === reason
                            ? "border-[#6B7B3A] bg-[#6B7B3A]"
                            : "border-[#E8E0D0] dark:border-zinc-600"
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
                            className="mt-2 w-full resize-none rounded-xl border border-[#6B7B3A]/40 bg-[#FBF7EB] dark:bg-zinc-800 px-4 py-3 text-[13px] leading-relaxed text-[#2A251D] dark:text-zinc-100 placeholder:text-[#A89B80] focus:border-[#6B7B3A]/60 focus:outline-none"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex gap-2">
                  <button
                    onClick={() => setShowCommentReportModal(false)}
                    className="flex flex-1 items-center justify-center rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800 py-3 text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-700"
                  >
                    취소
                  </button>
                  <button
                    onClick={async () => {
                      if (!user) { alert("로그인 후 이용 가능합니다"); return; }
                      if (!commentReportReason || commentReportTargetId === null) return;
                      const token = await getIdToken();
                      if (!token) { alert("로그인이 필요합니다"); return; }
                      const r = await createReport(
                        "comment",
                        commentReportTargetId,
                        Number(postId),
                        Number(categoryId),
                        commentReportReason,
                        commentReportReason === "기타" ? commentReportCustomReason : undefined,
                        token,
                      );
                      if (r && "error" in r && r.error) { alert(r.error); return; }
                      setCommentReportDone(true);
                    }}
                    className={`flex flex-1 items-center justify-center rounded-xl py-3 text-[13px] font-bold text-white transition-colors ${
                      commentReportReason
                        ? "bg-[#C0392B] hover:bg-[#A0311F] shadow-[0_4px_14px_-4px_rgba(192,57,43,0.4)]"
                        : "cursor-not-allowed bg-[#D4C7AA] dark:bg-zinc-600"
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4">
          <div className="absolute inset-0 bg-[#2A251D]/50 backdrop-blur-sm" onClick={() => setShowReportModal(false)} />
          <div className="relative w-full max-w-sm bg-[#FEFCF7] dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-[#E8E0D0] dark:border-zinc-700 px-6 pb-6 pt-4 overflow-hidden">
            <div className="mb-4 flex justify-center sm:hidden">
              <div className="h-1 w-10 rounded-full bg-[#E8E0D0] dark:bg-zinc-600" />
            </div>
            <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#C0392B]/40 to-transparent" />

            {reportDone ? (
              <div className="py-8 text-center">
                <p className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight">신고가 접수되었습니다</p>
                <p className="mt-2 text-[13px] text-[#8C8270] dark:text-zinc-400">검토 후 조치하겠습니다</p>
                <button
                  onClick={() => setShowReportModal(false)}
                  className="mt-6 w-full rounded-xl bg-[#6B7B3A] hover:bg-[#5A6930] py-3 text-[13px] font-bold text-white shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)]"
                >
                  확인
                </button>
              </div>
            ) : (
              <>
                <h3 className="mb-5 text-center text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight">
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
                        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-[13px] transition-all ${
                          reportReason === reason
                            ? "border-[#6B7B3A] bg-[#F5F0E5] font-semibold text-[#2A251D] dark:bg-[#6B7B3A]/20 dark:text-zinc-100"
                            : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB]/40 dark:bg-zinc-800/40 text-[#3A342A] dark:text-zinc-300 hover:border-[#6B7B3A]/40"
                        }`}
                      >
                        <span>{reason}</span>
                        <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                          reportReason === reason
                            ? "border-[#6B7B3A] bg-[#6B7B3A]"
                            : "border-[#E8E0D0] dark:border-zinc-600"
                        }`}>
                          {reportReason === reason && (
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
                            maxHeight: reportReason === "기타" ? "150px" : "0px",
                            opacity: reportReason === "기타" ? 1 : 0,
                          }}
                        >
                          <textarea
                            value={reportCustomReason}
                            onChange={(e) => setReportCustomReason(e.target.value)}
                            placeholder="신고 사유를 입력해주세요"
                            rows={3}
                            className="mt-2 w-full resize-none rounded-xl border border-[#6B7B3A]/40 bg-[#FBF7EB] dark:bg-zinc-800 px-4 py-3 text-[13px] leading-relaxed text-[#2A251D] dark:text-zinc-100 placeholder:text-[#A89B80] focus:border-[#6B7B3A]/60 focus:outline-none"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex gap-2">
                  <button
                    onClick={() => setShowReportModal(false)}
                    className="flex flex-1 items-center justify-center rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800 py-3 text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-700"
                  >
                    취소
                  </button>
                  <button
                    onClick={async () => {
                      if (!user) { alert("로그인 후 이용 가능합니다"); return; }
                      if (!reportReason) return;
                      const token = await getIdToken();
                      if (!token) { alert("로그인이 필요합니다"); return; }
                      const r = await createReport(
                        "post",
                        Number(postId),
                        Number(postId),
                        Number(categoryId),
                        reportReason,
                        reportReason === "기타" ? reportCustomReason : undefined,
                        token,
                      );
                      if (r && "error" in r && r.error) { alert(r.error); return; }
                      setReportDone(true);
                    }}
                    className={`flex flex-1 items-center justify-center rounded-xl py-3 text-[13px] font-bold text-white transition-colors ${
                      reportReason
                        ? "bg-[#C0392B] hover:bg-[#A0311F] shadow-[0_4px_14px_-4px_rgba(192,57,43,0.4)]"
                        : "cursor-not-allowed bg-[#D4C7AA] dark:bg-zinc-600"
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

      {/* 공유 토스트 */}
      {shareToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-[#3A342A] text-[#FEFCF7] px-5 py-3 rounded-full text-[13px] font-medium shadow-lg">
          {shareToast}
        </div>
      )}

      {/* 특정 댓글 하이라이트 애니메이션 */}
      <style jsx global>{`
        @property --comment-angle {
          syntax: "<angle>";
          initial-value: 0deg;
          inherits: false;
        }
        @keyframes comment-chase-spin {
          to { --comment-angle: 360deg; }
        }
        @keyframes comment-chase-fade {
          0%, 90% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes comment-bg-pulse {
          0% { background-color: rgba(107, 123, 58, 0); }
          20% { background-color: rgba(107, 123, 58, 0.14); }
          100% { background-color: rgba(107, 123, 58, 0); }
        }
        .comment-blink {
          position: relative;
          isolation: isolate;
          animation: comment-bg-pulse 1.8s ease-out forwards;
        }
        .comment-blink::before {
          content: "";
          position: absolute;
          inset: -4px;
          border-radius: inherit;
          padding: 3px;
          background: conic-gradient(
            from var(--comment-angle, 0deg),
            rgba(107, 123, 58, 0) 0deg,
            rgba(107, 123, 58, 0.9) 60deg,
            rgba(107, 123, 58, 0) 120deg,
            rgba(107, 123, 58, 0) 360deg
          );
          -webkit-mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
          mask-composite: exclude;
          animation:
            comment-chase-spin 1.6s linear,
            comment-chase-fade 1.8s ease-out forwards;
          pointer-events: none;
          z-index: 1;
        }
      `}</style>
    </div>
  );
}
