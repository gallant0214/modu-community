"use client";

import { useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createPost } from "@/app/lib/actions";
import { LoginRequired } from "@/app/components/login-required";

const regions = [
  "서울", "세종", "부산", "인천", "대전", "대구", "광주", "울산",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];

const examTypes = ["기타", "실기", "구술"];

export default function WritePage() {
  return (
    <LoginRequired>
      <WritePageContent />
    </LoginRequired>
  );
}

function WritePageContent() {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const params = useParams();
  const categoryId = params.id as string;

  const [selectedExamType, setSelectedExamType] = useState("기타");
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingData, setPendingData] = useState<FormData | null>(null);
  const [authorError, setAuthorError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [titleError, setTitleError] = useState(false);
  const [contentError, setContentError] = useState(false);
  const [regionError, setRegionError] = useState(false);

  async function handleSubmit(formData: FormData) {
    const author = (formData.get("author") as string)?.trim() ?? "";
    const password = (formData.get("password") as string) ?? "";
    const title = (formData.get("title") as string)?.trim() ?? "";
    const content = (formData.get("content") as string)?.trim() ?? "";
    const region = (formData.get("region") as string) ?? "";

    const aErr = !author || author.length < 2 || author.length >= 8 || /\s/.test(author);
    const pErr = password.length < 4 || password.length > 8;
    const tErr = !title;
    const cErr = !content;
    const rErr = !region;

    setAuthorError(aErr);
    setPasswordError(pErr);
    setTitleError(tErr);
    setContentError(cErr);
    setRegionError(rErr);

    if (aErr || pErr || tErr || cErr || rErr) return;

    formData.set("tags", selectedExamType);
    setPendingData(formData);
    setShowConfirm(true);
  }

  async function handleConfirm() {
    if (!pendingData) return;
    const result = await createPost(pendingData);
    if (result?.error) {
      alert(result.error);
      setShowConfirm(false);
      return;
    }
    router.push(`/category/${categoryId}`);
  }

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
            글쓰기
          </h1>
        </header>

        <form ref={formRef} onSubmit={(e) => { e.preventDefault(); handleSubmit(new FormData(formRef.current!)); }} className="flex flex-col">
          <input type="hidden" name="category_id" value={categoryId} />
          <input type="hidden" name="tags" value={selectedExamType} />

          <div className="space-y-6 px-4 py-5 md:px-6 md:py-8">
            {/* 1. 닉네임 + 비밀번호 */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  닉네임
                </label>
                <input
                  name="author"
                  required
                  maxLength={7}
                  placeholder="닉네임을 입력하세요"
                  onChange={() => authorError && setAuthorError(false)}
                  className={`w-full rounded-xl border bg-zinc-50 px-4 py-3 text-sm text-zinc-900 focus:outline-none dark:bg-zinc-900 dark:text-zinc-100 ${
                    authorError
                      ? "border-red-400 placeholder:text-red-400 focus:border-red-400"
                      : "border-zinc-200 placeholder:text-zinc-400 focus:border-blue-400 dark:border-zinc-700"
                  }`}
                />
              </div>
              <div className="flex-1">
                <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  비밀번호
                </label>
                <input
                  name="password"
                  type="password"
                  required
                  minLength={4}
                  maxLength={8}
                  placeholder="비밀번호 (4~8자리)"
                  onChange={() => passwordError && setPasswordError(false)}
                  className={`w-full rounded-xl border bg-zinc-50 px-4 py-3 text-sm text-zinc-900 focus:outline-none dark:bg-zinc-900 dark:text-zinc-100 ${
                    passwordError
                      ? "border-red-400 placeholder:text-red-400 focus:border-red-400"
                      : "border-zinc-200 placeholder:text-zinc-400 focus:border-blue-400 dark:border-zinc-700"
                  }`}
                />
              </div>
            </div>

            {/* 2. 지역 선택 */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                지역 선택
              </label>
              <div className="relative">
                <select
                  name="region"
                  defaultValue=""
                  required
                  onChange={() => regionError && setRegionError(false)}
                  className={`w-full appearance-none rounded-xl border bg-zinc-50 px-4 py-3 pr-10 text-sm text-zinc-900 focus:outline-none dark:bg-zinc-900 dark:text-zinc-100 ${
                    regionError
                      ? "border-red-400 text-red-400 focus:border-red-400"
                      : "border-zinc-200 focus:border-blue-400 dark:border-zinc-700"
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
                placeholder="제목을 입력하세요"
                onChange={() => titleError && setTitleError(false)}
                className={`w-full rounded-xl border bg-zinc-50 px-4 py-3 text-sm text-zinc-900 focus:outline-none dark:bg-zinc-900 dark:text-zinc-100 ${
                  titleError
                    ? "border-red-400 placeholder:text-red-400 focus:border-red-400"
                    : "border-zinc-200 placeholder:text-zinc-400 focus:border-blue-400 dark:border-zinc-700"
                }`}
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
                placeholder="시험장의 분위기, 실기 동작, 구술 질문 등 구체적인 경험을 공유해주세요. 다른 수험생들에게 큰 도움이 됩니다."
                rows={8}
                onChange={() => contentError && setContentError(false)}
                className={`w-full resize-none rounded-xl border bg-zinc-50 px-4 py-3 text-sm leading-relaxed text-zinc-900 focus:outline-none dark:bg-zinc-900 dark:text-zinc-100 ${
                  contentError
                    ? "border-red-400 placeholder:text-red-400 focus:border-red-400"
                    : "border-zinc-200 placeholder:text-zinc-400 focus:border-blue-400 dark:border-zinc-700"
                }`}
              />
            </div>
          </div>

          {/* 6. 취소 / 등록 */}
          <div className="flex gap-3 px-4 py-4 md:px-6">
            <Link
              href={`/category/${categoryId}`}
              className="flex flex-1 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              취소
            </Link>
            <button
              type="submit"
              className="flex flex-1 items-center justify-center rounded-xl bg-blue-500 py-3 text-sm font-semibold text-white hover:bg-blue-600"
            >
              등록
            </button>
          </div>
        </form>

        {/* 등록 확인 모달 */}
        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
              <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-zinc-900 dark:text-zinc-100">
                <span className="text-xl">⚠️</span> 등록 시 주의사항
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
