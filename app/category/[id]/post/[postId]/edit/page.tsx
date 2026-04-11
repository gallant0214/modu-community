"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import type { Post } from "@/app/lib/types";
import { LoginRequired } from "@/app/components/login-required";
import { useAuth } from "@/app/components/auth-provider";

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
  const { getIdToken } = useAuth();

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [selectedExamType, setSelectedExamType] = useState("기타");
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingData, setPendingData] = useState<FormData | null>(null);
  const [titleError, setTitleError] = useState(false);
  const [contentError, setContentError] = useState(false);
  const [regionError, setRegionError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch(`/api/post/${postId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        // 관리자 여부 확인
        let isAdmin = false;
        if (token) {
          try {
            const adminRes = await fetch("/api/auth/is-admin", { headers: { Authorization: `Bearer ${token}` } });
            const adminData = await adminRes.json();
            isAdmin = !!adminData.isAdmin;
          } catch {}
        }
        if (!data?.is_mine && !isAdmin) {
          setPermissionDenied(true);
          setLoading(false);
          return;
        }
        setPost(data);
        if (data?.tags) {
          const tag = data.tags.split(",")[0]?.trim();
          if (examTypes.includes(tag)) setSelectedExamType(tag);
        }
        setLoading(false);
      } catch {
        setLoading(false);
      }
    })();
  }, [postId, getIdToken]);

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
    try {
      const token = await getIdToken();
      if (!token) { alert("로그인이 필요합니다"); setShowConfirm(false); return; }
      const res = await fetch(`/api/post/${postId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: pendingData.get("title") as string,
          content: pendingData.get("content") as string,
          region: pendingData.get("region") as string,
          tags: pendingData.get("tags") as string,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "수정에 실패했습니다");
        setShowConfirm(false);
        return;
      }
      router.push(`/category/${categoryId}/post/${postId}`);
    } catch {
      alert("오류가 발생했습니다");
      setShowConfirm(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F4EC] dark:bg-zinc-950">
        <div className="w-7 h-7 border-2 border-[#6B7B3A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (permissionDenied) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8F4EC] dark:bg-zinc-950 px-4">
        <div className="w-full max-w-md bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-8 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-[#C0392B]" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <p className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 mb-1">수정 권한이 없습니다</p>
          <p className="text-[12px] text-[#8C8270] dark:text-zinc-500 mb-5">본인이 작성한 글만 수정할 수 있어요</p>
          <Link href={`/category/${categoryId}/post/${postId}`} className="inline-flex items-center gap-1.5 bg-[#6B7B3A] hover:bg-[#5A6930] text-white text-[13px] font-semibold px-5 py-2.5 rounded-xl shadow-[0_6px_18px_-8px_rgba(107,123,58,0.5)] transition-colors">
            게시글로 돌아가기
          </Link>
        </div>
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

  const inputCls = "w-full rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB] dark:bg-zinc-800 px-4 py-3 text-[14px] text-[#2A251D] dark:text-zinc-100 placeholder:text-[#A89B80] focus:border-[#6B7B3A]/50 focus:bg-[#FEFCF7] dark:focus:bg-zinc-900 focus:outline-none transition-colors";
  const inputErrorCls = "w-full rounded-xl border border-[#C0392B]/60 bg-[#FBEFEC] dark:bg-[#2A1A17] px-4 py-3 text-[14px] text-[#2A251D] dark:text-zinc-100 placeholder:text-[#C0392B]/60 focus:outline-none transition-colors";

  return (
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950 pb-16">
      <div className="mx-auto w-full max-w-lg md:max-w-3xl lg:max-w-4xl px-4 sm:px-6 py-4 sm:py-6">
        {/* ═══ 상단 바 ═══ */}
        <header className="sticky top-14 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-[#F8F4EC]/85 dark:bg-zinc-950/85 backdrop-blur-md border-b border-[#E8E0D0]/70 dark:border-zinc-800 mb-5">
          <Link
            href={`/category/${categoryId}/post/${postId}`}
            className="inline-flex items-center gap-1.5 -ml-1 px-1 py-0.5 rounded-lg text-[#6B7B3A] hover:bg-[#F5F0E5]/60 dark:hover:bg-zinc-800 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-[11px] font-bold tracking-[0.15em] uppercase">게시글로 돌아가기</span>
          </Link>
        </header>

        {/* ═══ 히어로 카드 ═══ */}
        <section className="relative bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-6 sm:p-7 shadow-[0_1px_0_rgba(0,0,0,0.02),0_12px_32px_-20px_rgba(107,93,71,0.2)] mb-5">
          <div aria-hidden className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
            <div className="absolute -top-20 -right-16 w-56 h-56 rounded-full bg-[#6B7B3A]/[0.05] blur-3xl" />
            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/40 to-transparent" />
          </div>
          <div className="relative flex items-center gap-3">
            <span className="w-11 h-11 rounded-2xl bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-[#6B7B3A] dark:text-[#A8B87A]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </span>
            <div className="flex-1 min-w-0">
              <div className="inline-flex items-center gap-1.5 mb-1">
                <span className="w-1 h-3 rounded-full bg-[#6B7B3A]" />
                <span className="text-[10px] font-bold tracking-[0.18em] text-[#6B7B3A] uppercase">Edit Post</span>
              </div>
              <h1 className="text-[17px] sm:text-[18px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight">게시글 수정하기</h1>
              <p className="text-[12px] text-[#8C8270] dark:text-zinc-500 mt-0.5">내용을 다듬어 더 도움이 되는 후기로 업데이트해 보세요</p>
            </div>
          </div>
        </section>

        <form ref={formRef} onSubmit={(e) => { e.preventDefault(); handleSubmit(new FormData(formRef.current!)); }}>
          <div className="space-y-5">

            {/* 01. 닉네임 (읽기 전용) */}
            <Section number={1} title="작성자" subtitle="닉네임은 수정할 수 없어요">
              <Field label="닉네임">
                <input
                  value={post.author}
                  disabled
                  className="w-full rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#F5F0E5]/60 dark:bg-zinc-800/60 px-4 py-3 text-[14px] text-[#8C8270] dark:text-zinc-500 cursor-not-allowed"
                />
              </Field>
            </Section>

            {/* 02. 지역 선택 */}
            <Section number={2} title="지역" subtitle="시험을 치른 지역을 선택해주세요">
              <Field label="지역 선택" required>
                <div className="relative">
                  <select
                    name="region"
                    defaultValue={post.region || ""}
                    required
                    onChange={() => regionError && setRegionError(false)}
                    className={`appearance-none pr-10 ${regionError ? inputErrorCls : inputCls}`}
                  >
                    <option value="" disabled>지역을 선택하세요</option>
                    {regions.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <svg className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A89B80]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                {regionError && <p className="mt-1.5 text-[11px] text-[#C0392B]">지역을 선택해주세요</p>}
              </Field>
            </Section>

            {/* 03. 시험 유형 */}
            <Section number={3} title="시험 유형" subtitle="글의 성격을 구분해 다른 수험생이 찾기 쉽게">
              <Field label="시험 유형">
                <div className="flex items-center gap-1 rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB] dark:bg-zinc-800 p-1">
                  {examTypes.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setSelectedExamType(type)}
                      className={`flex-1 rounded-lg py-2.5 text-[13px] font-semibold transition-all ${
                        selectedExamType === type
                          ? "bg-[#6B7B3A] text-white shadow-[0_2px_8px_-2px_rgba(107,123,58,0.4)]"
                          : "text-[#8C8270] dark:text-zinc-400 hover:text-[#3A342A] dark:hover:text-zinc-200"
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </Field>
            </Section>

            {/* 04. 제목 */}
            <Section number={4} title="제목" subtitle="핵심 내용을 한눈에 알 수 있게">
              <Field label="제목" required>
                <input
                  name="title"
                  required
                  defaultValue={post.title}
                  placeholder="제목을 입력하세요"
                  onChange={() => titleError && setTitleError(false)}
                  className={titleError ? inputErrorCls : inputCls}
                />
                {titleError && <p className="mt-1.5 text-[11px] text-[#C0392B]">제목을 입력해주세요</p>}
              </Field>
            </Section>

            {/* 05. 경험 공유 */}
            <Section number={5} title="경험 공유" subtitle="구체적일수록 다른 수험생에게 더 큰 도움이 돼요">
              <Field label="내용" required>
                <textarea
                  name="content"
                  required
                  defaultValue={post.content}
                  placeholder="시험장의 분위기, 실기 동작, 구술 질문 등 구체적인 경험을 공유해주세요. 다른 수험생들에게 큰 도움이 됩니다."
                  rows={10}
                  onChange={() => contentError && setContentError(false)}
                  className={`resize-none leading-relaxed ${contentError ? inputErrorCls : inputCls}`}
                />
                {contentError && <p className="mt-1.5 text-[11px] text-[#C0392B]">내용을 입력해주세요</p>}
              </Field>
            </Section>
          </div>

          {/* ═══ 액션 영역 ═══ */}
          <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl p-3 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
            <Link
              href={`/category/${categoryId}/post/${postId}`}
              className="flex-1 inline-flex items-center justify-center rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800 py-3 text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-700 transition-colors"
            >
              취소
            </Link>
            <button
              type="submit"
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#6B7B3A] hover:bg-[#5A6930] py-3 text-[13px] font-bold text-white shadow-[0_6px_18px_-8px_rgba(107,123,58,0.5)] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              수정 저장
            </button>
          </div>
        </form>

        {/* ═══ 수정 확인 모달 ═══ */}
        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-[#2A251D]/50 backdrop-blur-sm" onClick={() => setShowConfirm(false)} />
            <div className="relative w-full max-w-sm bg-[#FEFCF7] dark:bg-zinc-900 rounded-3xl shadow-2xl border border-[#E8E0D0] dark:border-zinc-700 p-6 overflow-hidden">
              <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/40 to-transparent" />
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex w-9 h-9 items-center justify-center rounded-xl bg-[#6B7B3A]/10">
                  <svg className="w-5 h-5 text-[#6B7B3A]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
                <h3 className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight">수정 전 주의사항</h3>
              </div>
              <p className="mb-5 text-[12.5px] leading-relaxed text-[#6B5D47] dark:text-zinc-400">
                욕설·비방·광고·불법 행위 등 <strong className="text-[#2A251D] dark:text-zinc-200">모두의지도사 서비스 이용약관에 위배되는 내용</strong>으로 수정하면 게시글 작성이 영구적으로 금지될 수 있어요.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex flex-1 items-center justify-center rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800 py-3 text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-700 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex flex-1 items-center justify-center rounded-xl bg-[#6B7B3A] hover:bg-[#5A6930] py-3 text-[13px] font-bold text-white shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)] transition-colors"
                >
                  수정하기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── 재사용 프리젠테이셔널 헬퍼 ─── */
function Section({ number, title, subtitle, children }: { number: number; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-5 sm:p-6 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      <div className="flex items-start gap-3 mb-4">
        <span className="shrink-0 w-7 h-7 rounded-full bg-[#F5F0E5] dark:bg-zinc-800 text-[#6B7B3A] dark:text-[#A8B87A] text-[12px] font-bold flex items-center justify-center">
          {number.toString().padStart(2, "0")}
        </span>
        <div className="flex-1 min-w-0 pt-0.5">
          <h2 className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight">{title}</h2>
          {subtitle && <p className="text-[12px] text-[#8C8270] dark:text-zinc-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-400 tracking-wide">
        {label}{required && <span className="text-[#C0392B] ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
