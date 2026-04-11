"use client";

import { useState } from "react";
import Link from "next/link";
import { likePost } from "@/app/lib/actions";
import type { Post } from "@/app/lib/types";

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}. ${m}. ${day}. ${h}:${min}`;
}

export function PostCardItem({ post, isNotice }: { post: Post; isNotice?: boolean }) {
  const [likes, setLikes] = useState(Number(post.likes));

  const tags = post.tags ? post.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
  const commentsCount = Number(post.comments_count);

  // 지역 배지: "대구 - 수성구" 형태면 2개 배지로 분리
  const regionParts: string[] = (() => {
    if (!post.region || post.region === "전국") return [];
    return post.region.split(/\s*-\s*/).map((p) => p.trim()).filter(Boolean);
  })();

  async function handleLike(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setLikes((prev) => prev + 1);
    await likePost(post.id, post.category_id);
  }

  return (
    <Link
      href={`/category/${post.category_id}/post/${post.id}`}
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
          {regionParts.map((part) => (
            <span
              key={part}
              className="shrink-0 rounded-md bg-[#F5F0E5] dark:bg-zinc-800 px-1.5 py-0.5 text-[11px] font-medium text-[#6B5D47] dark:text-zinc-400 border border-[#E8E0D0]/60 dark:border-zinc-700"
            >
              {part}
            </span>
          ))}
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
            {post.author}
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
        {post.author}
      </span>
      <span className="hidden w-20 shrink-0 text-center text-[11px] text-[#A89B80] md:block">
        {formatDateTime(post.created_at)}
      </span>
      <span className="hidden w-14 shrink-0 text-center text-[11px] text-[#A89B80] md:block">
        {Number(post.views)}
      </span>

      {/* Like + Comment (desktop only) */}
      <div className="hidden shrink-0 items-center gap-3 md:flex">
        <button
          onClick={handleLike}
          className="flex items-center gap-0.5 text-[11px] text-[#A89B80] hover:text-[#C75555] transition-colors"
        >
          <span className={`text-[13px] ${likes > 0 ? "text-[#C75555]" : "text-[#D4B8B8]"}`}>{likes > 0 ? "♥" : "♡"}</span>
          <span>{likes}</span>
        </button>
        <span className="flex items-center gap-0.5 text-[11px] text-[#A89B80]">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
          </svg>
          <span>{commentsCount}</span>
        </span>
      </div>
    </Link>
  );
}
