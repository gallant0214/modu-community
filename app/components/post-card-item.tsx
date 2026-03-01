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

  async function handleLike(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setLikes((prev) => prev + 1);
    await likePost(post.id, post.category_id);
  }

  return (
    <Link
      href={`/category/${post.category_id}/post/${post.id}`}
      className={`flex items-center gap-2 px-4 py-3 hover:bg-zinc-50 md:px-6 dark:hover:bg-zinc-800/50 ${isNotice ? "bg-zinc-50 dark:bg-zinc-800/30" : ""}`}
    >
      {/* Title area (flex-1) */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {/* Tags inline */}
          {tags.map((tag) => (
            <span
              key={tag}
              className="shrink-0 rounded bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-600 dark:bg-violet-950 dark:text-violet-400"
            >
              {tag}
            </span>
          ))}
          {post.region && post.region !== "전국" && (
            <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              {post.region}
            </span>
          )}
          {/* Title */}
          <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {post.title}
          </span>
          {/* Comment count inline */}
          {commentsCount > 0 && (
            <span className="shrink-0 text-xs font-semibold text-violet-500">
              [{commentsCount}]
            </span>
          )}
        </div>
        {/* Mobile: author left, likes+views right */}
        <div className="mt-1 flex items-center justify-between text-xs text-zinc-400 md:hidden">
          <span>
            {post.author}
            {post.region && <> · {post.region}</>}
            {" · "}
            {formatDateTime(post.created_at)}
          </span>
          <span className="shrink-0 ml-2">
            <span className="text-red-500">{likes > 0 ? "♥" : "♡"}</span> {likes} · 조회 {Number(post.views)}
          </span>
        </div>
      </div>

      {/* Desktop columns */}
      <span className="hidden w-28 shrink-0 text-center text-xs text-zinc-500 md:block dark:text-zinc-400">
        {post.author}
      </span>
      <span className="hidden w-20 shrink-0 text-center text-xs text-zinc-400 md:block">
        {formatDateTime(post.created_at)}
      </span>
      <span className="hidden w-14 shrink-0 text-center text-xs text-zinc-400 md:block">
        {Number(post.views)}
      </span>

      {/* Like + Comment (desktop only) */}
      <div className="hidden shrink-0 items-center gap-2 md:flex">
        <button
          onClick={handleLike}
          className="flex items-center gap-0.5 text-xs text-zinc-400 hover:text-red-500"
        >
          <span className={`text-sm ${likes > 0 ? "text-red-500" : "text-red-400"}`}>{likes > 0 ? "♥" : "♡"}</span>
          <span>{likes}</span>
        </button>
        <span className="flex items-center gap-0.5 text-xs text-zinc-400">
          <span className="text-sm">💬</span>
          <span>{commentsCount}</span>
        </span>
      </div>
    </Link>
  );
}
