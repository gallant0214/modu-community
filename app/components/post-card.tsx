"use client";

import { useState } from "react";
import { deletePost } from "@/app/lib/actions";
import { PostForm } from "./post-form";
import type { Post } from "@/app/lib/types";

export function PostCard({ post, index }: { post: Post; index: number }) {
  const [isEditing, setIsEditing] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  if (isEditing) {
    return (
      <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
        <PostForm post={post} onCancel={() => setIsEditing(false)} />
      </div>
    );
  }

  return (
    <div className="border-b border-zinc-200 dark:border-zinc-800">
      <div
        className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-zinc-50 active:bg-zinc-100 dark:hover:bg-zinc-900 dark:active:bg-zinc-800"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="w-8 shrink-0 text-center text-xs text-zinc-400">
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {post.title}
          </h3>
        </div>
        <span className="shrink-0 text-xs text-zinc-400">
          {new Date(post.created_at).toLocaleString("ko-KR", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      {isOpen && (
        <div className="bg-zinc-50 px-4 py-4 pl-16 dark:bg-zinc-900/50">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {post.content}
          </p>
          <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setIsEditing(true)}
              className="rounded-lg px-3 py-1 text-xs text-zinc-500 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              수정
            </button>
            <form action={async (formData: FormData) => {
              const id = Number(formData.get("id"));
              const categoryId = Number(formData.get("category_id"));
              const password = formData.get("password") as string;
              await deletePost(id, categoryId, password);
            }}>
              <input type="hidden" name="id" value={post.id} />
              <input type="hidden" name="category_id" value={post.category_id} />
              <input type="hidden" name="password" value="" />
              <button
                type="submit"
                className="rounded-lg px-3 py-1 text-xs text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                onClick={(e) => {
                  if (!confirm("삭제하시겠습니까?")) e.preventDefault();
                }}
              >
                삭제
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
