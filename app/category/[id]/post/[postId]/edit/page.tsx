"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { updatePost } from "@/app/lib/actions";
import type { Post } from "@/app/lib/types";
import { LoginRequired } from "@/app/components/login-required";

const regions = [
  "서울", "세종", "부산", "인천", "대전", "대구", "광주", "울산",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];

const examTypes = ["기타", "실기", "구술"];

export default function EditPostPage() {
  return (
    <LoginRequired>
      <EditPostContent />
    </LoginRequired>
  );
}

function EditPostContent() {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const params = useParams();
  const categoryId = params.id as string;
  const postId = params.postId as string;

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedExamType, setSelectedExamType] = useState("기타");
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingData, setPendingData] = useState<FormData | null>(null);
  const [titleError, setTitleError] = useState(false);
  const [contentError, setContentError] = useState(false);
  const [regionError, setRegionError] = useState(false);

  useEffect(() => {
    fetch(`/api/post/${postId}`)
      .then((res) => res.json())
      .then((data) => {
        setPost(data);
        if (data?.tags) {
          const tag = data.tags.split(",")[0]?.trim();
          if (examTypes.includes(tag)) setSelectedExamType(tag);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [postId]);

  async function handleSubmit(formData: FormData) {
    const title = (formData.get("title") as string)?.trim() ?? "";
    const content = (formData.get("content") as string)?.trim() ?? "";
    const region = (formData.get("region") as string) ?? "";

    const tErr = !title;
    const cErr = !content;
    const rErr = !region;

    setTitleError(tErr);
    setContentError(cErr);
    setRegionError(rErr);

    if (tErr || cErr || rErr) return;

    formData.set("id", postId);
    formData.set("category_id", categoryId);
    formData.set("tags", selectedExamType);
    setPendingData(formData);
    setShowConfirm(true);
  }

  async function handleConfirm() {
    if (!pendingData) return;
    const result = await updatePost(pendingData);
    if (result?.error) {
      alert(result.error);
      setShowConfirm(false);
      return;
    }
    router.push(`/category/${categoryId}/post/${postId}`);
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

  const inputBase = "w-full rounded-xl border bg-zinc-50 px-4 py-3 text-sm text-zinc-900 focus:outline-none dark:bg-zinc-900 dark:text-zinc-100";
  const inputNormal = "border-zinc-200 placeholder:text-zinc-400 focus:border-blue-400 dark:border-zinc-700";
  const inputError = "border-red-400 placeholder:text-red-400 focus:border-red-400";

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-zinc-950">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col md:max-w-3xl lg:max-w-4xl">
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3 md:px-6 md:py-4 dark:border-zinc-800">
          <Link
            href={`/category/${categoryId}/post/${postId}`}
            className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            게시글 수정
          </h1>
        </header>

        <form ref={formRef} onSubmit={(e) => { e.preventDefault(); handleSubmit(new FormData(formRef.current!)); }} className="flex flex-1 flex-col">
          <div className="flex-1 space-y-6 px-4 py-5 md:px-6 md:py-8">
            {/* 1. 닉네임 (읽기 전용) */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                닉네임
              </label>
              <input
                value={post.author}
                disabled
                className={`${inputBase} border-zinc-200 text-zinc-400 dark:border-zinc-700`}
              />
            </div>

            {/* 2. 지역 선택 */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                지역 선택
              </label>
              <div className="relative">
                <select
                  name="region"
                  defaultValue={post.region || ""}
                  required
                  onChange={() => regionError && setRegionError(false)}
                  className={`w-full appearance-none rounded-xl border bg-zinc-50 px-4 py-3 pr-10 text-sm text-zinc-900 focus:outline-none dark:bg-zinc-900 dark:text-zinc-100 ${
                    regionError ? "border-red-400 text-red-400 focus:border-red-400" : "border-zinc-200 focus:border-blue-400 dark:border-zinc-700"
                  }`}
                >
                  <option value="" disabled className="text-red-400">지역을 선택하세요</option>
                  {regions.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {/* 3. 시험 유형 */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                시험 유형
              </label>
              <div className="flex rounded-xl border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-700 dark:bg-zinc-900">
                {examTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSelectedExamType(type)}
                    className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-all ${
                      selectedExamType === type
                        ? "bg-white text-blue-600 shadow-sm dark:bg-zinc-800 dark:text-blue-400"
                        : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. 제목 */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                제목
              </label>
              <input
                name="title"
                required
                defaultValue={post.title}
                placeholder="제목을 입력하세요"
                onChange={() => titleError && setTitleError(false)}
                className={`${inputBase} ${titleError ? inputError : inputNormal}`}
              />
            </div>

            {/* 5. 내용 */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                경험 공유
              </label>
              <textarea
                name="content"
                required
                defaultValue={post.content}
                placeholder="시험장의 분위기, 실기 동작, 구술 질문 등 구체적인 경험을 공유해주세요. 다른 수험생들에게 큰 도움이 됩니다."
                rows={8}
                onChange={() => contentError && setContentError(false)}
                className={`${inputBase} resize-none leading-relaxed ${contentError ? inputError : inputNormal}`}
              />
            </div>
          </div>

          {/* 6. 취소 / 저장 */}
          <div className="flex gap-3 border-t border-zinc-200 px-4 py-4 md:px-6 dark:border-zinc-800">
            <Link
              href={`/category/${categoryId}/post/${postId}`}
              className="flex flex-1 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              취소
            </Link>
            <button
              type="submit"
              className="flex flex-1 items-center justify-center rounded-xl bg-blue-500 py-3 text-sm font-semibold text-white hover:bg-blue-600"
            >
              저장
            </button>
          </div>
        </form>

        {/* 수정 확인 모달 */}
        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
              <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-zinc-900 dark:text-zinc-100">
                <span className="text-xl">⚠️</span> 수정 시 주의사항
              </h3>
              <div className="mb-6 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                <p className="flex gap-1">
                  <span>•</span>
                  <span>
                    욕설, 비방, 광고, 불법 행위 등
                    <br />
                    &apos;모두의지도사 서비스 이용약관에
                    <br />
                    위배되는 내용&apos; 작성 시 게시글 작성이
                    <br />
                    영구적으로 금지될 수 있습니다.
                  </span>
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex flex-1 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  취소
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex flex-1 items-center justify-center rounded-xl bg-blue-500 py-3 text-sm font-semibold text-white hover:bg-blue-600"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
