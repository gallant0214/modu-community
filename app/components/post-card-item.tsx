"use client";

import { useState, useRef, useEffect, forwardRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import type { Post } from "@/app/lib/types";
import { useAuth } from "@/app/components/auth-provider";
import { SendMessageModal } from "@/app/components/send-message-modal";
import { formatRegionShort } from "@/app/lib/region-format";

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}. ${m}. ${day}. ${h}:${min}`;
}

export function PostCardItem({ post, isNotice, hideCategoryTag }: { post: Post; isNotice?: boolean; hideCategoryTag?: string }) {
  const likes = Number(post.likes);
  const [authorMenu, setAuthorMenu] = useState(false);
  const [showSendMessage, setShowSendMessage] = useState(false);
  const authorMenuRef = useRef<HTMLDivElement>(null);
  const mobileTriggerRef = useRef<HTMLSpanElement>(null);
  const desktopTriggerRef = useRef<HTMLSpanElement>(null);
  useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentUrl = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;

  // 외부 클릭 시 메뉴 닫기 (트리거 클릭은 무시 — 트리거 자체가 토글하므로)
  useEffect(() => {
    if (!authorMenu) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (authorMenuRef.current?.contains(target)) return;
      if (mobileTriggerRef.current?.contains(target)) return;
      if (desktopTriggerRef.current?.contains(target)) return;
      setAuthorMenu(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [authorMenu]);

  // hideCategoryTag가 지정되면 해당 태그를 숨김 (종목 내부에서 중복 표시 방지)
  const allTags = post.tags ? post.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
  const tags = hideCategoryTag ? allTags.filter((t) => t !== hideCategoryTag) : allTags;
  const commentsCount = Number(post.comments_count);

  // 지역 배지: "대구광역시 - 수성구" → "대구 수성구" 한 태그 (약어)
  const regionDisplay = formatRegionShort(post.region);

  return (
    <Link
      href={`/category/${post.category_id}/post/${post.id}?from=${encodeURIComponent(currentUrl)}`}
      className={`group flex items-center gap-2 px-4 py-3.5 md:px-6 md:py-3.5 transition-colors ${
        isNotice
          ? "bg-[#FBF7EB]/60 dark:bg-zinc-800/30 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800/60"
          : "hover:bg-[#F5F0E5]/60 dark:hover:bg-zinc-800/40"
      }`}
    >
      {/* Title area (flex-1) */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Tags inline */}
          {tags.map((tag) => (
            <span
              key={tag}
              className="shrink-0 rounded-md bg-[#EFE7D5] dark:bg-[#6B7B3A]/20 px-1.5 py-0.5 text-[11px] font-semibold text-[#6B7B3A] dark:text-[#A8B87A]"
            >
              {tag}
            </span>
          ))}
          {regionDisplay && (
            <span
              className="shrink-0 rounded-md bg-[#F5F0E5] dark:bg-zinc-800 px-1.5 py-0.5 text-[11px] font-medium text-[#6B5D47] dark:text-zinc-400 border border-[#E8E0D0]/60 dark:border-zinc-700"
            >
              {regionDisplay}
            </span>
          )}
          {/* Title */}
          <span className="truncate text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 group-hover:text-[#6B7B3A] transition-colors">
            {post.title}
          </span>
          {/* Comment count inline */}
          {commentsCount > 0 && (
            <span className="shrink-0 text-[12px] font-bold text-[#6B7B3A] dark:text-[#A8B87A]">
              [{commentsCount}]
            </span>
          )}
        </div>
        {/* Mobile: author left, likes+views right */}
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#A89B80] dark:text-zinc-500 md:hidden">
          <span className="truncate">
            <span className="inline-block">
              <span
                ref={mobileTriggerRef}
                role="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAuthorMenu((v) => !v); }}
                className="font-medium hover:text-[#6B7B3A] hover:underline cursor-pointer transition-colors"
              >
                {post.author}
              </span>
            </span>
            {" · "}
            {formatDateTime(post.created_at)}
          </span>
          <span className="shrink-0 ml-2 flex items-center gap-1.5">
            <span className="inline-flex items-center gap-0.5">
              <span className={likes > 0 ? "text-[#C75555]" : "text-[#D4B8B8]"}>{likes > 0 ? "♥" : "♡"}</span>
              {likes}
            </span>
            <span className="text-[#C7B89B]">·</span>
            <span>조회 {Number(post.views)}</span>
          </span>
        </div>
      </div>

      {/* Desktop columns */}
      <span className="hidden w-28 shrink-0 text-center text-[12px] text-[#6B5D47] dark:text-zinc-400 md:block font-medium">
        <span
          ref={desktopTriggerRef}
          role="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAuthorMenu((v) => !v); }}
          className="hover:text-[#6B7B3A] hover:underline cursor-pointer transition-colors"
        >
          {post.author}
        </span>
      </span>
      <span className="hidden w-20 shrink-0 text-center text-[11px] text-[#A89B80] md:block">
        {formatDateTime(post.created_at)}
      </span>
      <span className="hidden w-14 shrink-0 text-center text-[11px] text-[#A89B80] md:block">
        {Number(post.views)}
      </span>

      {/* Like + Comment (desktop only) — 목록에선 표시만, 카운트는 상세 페이지에서 */}
      <div className="hidden shrink-0 items-center gap-3 md:flex">
        <span className="flex items-center gap-0.5 text-[11px] text-[#A89B80]">
          <span className={`text-[13px] ${likes > 0 ? "text-[#C75555]" : "text-[#D4B8B8]"}`}>{likes > 0 ? "♥" : "♡"}</span>
          <span>{likes}</span>
        </span>
        <span className="flex items-center gap-0.5 text-[11px] text-[#A89B80]">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
          </svg>
          <span>{commentsCount}</span>
        </span>
      </div>
      {authorMenu && (
        <AuthorDropdown
          ref={authorMenuRef}
          author={post.author}
          categoryId={post.category_id}
          triggerRefs={[mobileTriggerRef, desktopTriggerRef]}
          onViewPosts={() => { setAuthorMenu(false); router.push(`/category/${post.category_id}?searchType=author&q=${encodeURIComponent(post.author)}`); }}
          onSendMessage={() => { setAuthorMenu(false); setShowSendMessage(true); }}
        />
      )}
      <SendMessageModal
        open={showSendMessage}
        onClose={() => setShowSendMessage(false)}
        receiverNickname={post.author}
      />
    </Link>
  );
}

/**
 * 게시글 리스트의 리스트 컨테이너가 overflow-hidden(둥근 모서리 등)이라
 * 드롭다운을 absolute로 띄우면 카드 밖이 잘림.
 * → createPortal로 document.body 에 렌더링 + getBoundingClientRect로 위치 계산.
 */
const AuthorDropdown = forwardRef<HTMLDivElement, {
  author: string; categoryId: number;
  triggerRefs: React.RefObject<HTMLElement | null>[];
  onViewPosts: () => void; onSendMessage: () => void;
}>(function AuthorDropdown({ author, triggerRefs, onViewPosts, onSendMessage }, ref) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    function update() {
      // 모바일/데스크톱 트리거 둘 다 DOM에 있지만 한 쪽은 display:none
      // → getBoundingClientRect의 width가 0 인 쪽은 무시하고 visible 한 쪽 사용
      const visible = triggerRefs.find(r => {
        const el = r.current;
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (!visible || !visible.current) return;
      const r = visible.current.getBoundingClientRect();
      setPos({
        top: r.bottom + 6,
        left: r.left + r.width / 2,
      });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [triggerRefs]);

  if (typeof document === "undefined" || !pos) return null;

  return createPortal(
    <div
      ref={ref}
      style={{ position: "fixed", top: pos.top, left: pos.left, transform: "translateX(-50%)" }}
      className="z-[9999] min-w-[140px] bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-xl shadow-[0_8px_24px_-8px_rgba(107,93,71,0.35)] overflow-hidden"
    >
      <div className="px-3 py-2 border-b border-[#E8E0D0]/60 dark:border-zinc-800">
        <p className="text-[11px] font-bold text-[#6B5D47] dark:text-zinc-400 truncate">{author}</p>
      </div>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onViewPosts(); }}
        className="w-full text-left px-3 py-2.5 text-[12px] font-medium text-[#2A251D] dark:text-zinc-200 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors flex items-center gap-2"
      >
        <svg className="w-3.5 h-3.5 text-[#8C8270]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        게시글 보기
      </button>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSendMessage(); }}
        className="w-full text-left px-3 py-2.5 text-[12px] font-medium text-[#2A251D] dark:text-zinc-200 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors flex items-center gap-2"
      >
        <svg className="w-3.5 h-3.5 text-[#8C8270]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        쪽지 보내기
      </button>
    </div>,
    document.body,
  );
});
