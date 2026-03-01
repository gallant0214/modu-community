"use client";

import { useRef } from "react";
import { createPost, updatePost } from "@/app/lib/actions";
import type { Post } from "@/app/lib/types";

interface PostFormProps {
  categoryId?: number;
  post?: Post;
  onCancel?: () => void;
}

export function PostForm({ categoryId, post, onCancel }: PostFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const isEdit = !!post;

  async function handleAction(formData: FormData) {
    if (isEdit) {
      await updatePost(formData);
      onCancel?.();
    } else {
      await createPost(formData);
      formRef.current?.reset();
    }
  }

  const inputClass =
    "w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

  return (
    <form ref={formRef} action={handleAction} className="space-y-3">
      <input type="hidden" name="category_id" value={post?.category_id ?? categoryId} />
      {isEdit && post && <input type="hidden" name="id" value={post.id} />}
      {!isEdit && (
        <div className="flex gap-2">
          <input name="author" defaultValue="" placeholder="닉네임" required className={inputClass} />
          <input name="region" defaultValue="전국" placeholder="지역" className={inputClass} />
        </div>
      )}
      {!isEdit && (
        <input name="tags" defaultValue="" placeholder="태그 (쉼표로 구분)" className={inputClass} />
      )}
      <input name="title" defaultValue={post?.title ?? ""} placeholder="제목" required className={inputClass} />
      <textarea
        name="content"
        defaultValue={post?.content ?? ""}
        placeholder="내용을 입력하세요"
        required
        rows={4}
        className={`${inputClass} resize-none`}
      />
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-full bg-violet-500 px-5 py-2 text-sm font-medium text-white hover:bg-violet-600"
        >
          {isEdit ? "저장" : "등록"}
        </button>
        {isEdit && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full bg-zinc-100 px-5 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            취소
          </button>
        )}
      </div>
    </form>
  );
}
