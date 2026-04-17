"use client";

import { useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createPost } from "@/app/lib/actions";
import { LoginRequired } from "@/app/components/login-required";
import { useAuth } from "@/app/components/auth-provider";
import { REGION_GROUPS, type RegionGroup } from "@/app/lib/region-data";
import dynamic from "next/dynamic";
const RichEditor = dynamic(() => import("@/app/components/rich-editor"), { ssr: false });

const examTypes = ["기타", "실기", "구술"];

export default function WritePage() {
  return (
    <LoginRequired>
      <WritePageContent />
    </LoginRequired>
  );
}

/* ── 섹션 카드 ── */
function Section({ number, title, subtitle, children }: { number: number; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-5 sm:p-6 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      <div className="flex items-start gap-3 mb-5">
        <span className="shrink-0 w-7 h-7 rounded-full bg-[#F5F0E5] dark:bg-zinc-800 text-[#6B7B3A] dark:text-[#A8B87A] text-[12px] font-bold flex items-center justify-center">
          {number.toString().padStart(2, "0")}
        </span>
        <div className="flex-1 min-w-0 pt-0.5">
          <h2 className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight">{title}</h2>
          {subtitle && <p className="text-[12px] text-[#8C8270] dark:text-zinc-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

/* ── 필드 라벨 ── */
function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1.5 block text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-400 tracking-wide">
      {children}
      {required && <span className="text-[#C0392B] ml-0.5">*</span>}
    </label>
  );
}

function WritePageContent() {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const params = useParams();
  const categoryId = params.id as string;
  const { user, nickname, getIdToken } = useAuth();

  const [selectedExamType, setSelectedExamType] = useState("기타");
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingData, setPendingData] = useState<FormData | null>(null);
  const [titleError, setTitleError] = useState(false);
  const [contentError, setContentError] = useState(false);
  const [regionError, setRegionError] = useState(false);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [richContent, setRichContent] = useState("");

  /* 지역 선택 (2단계 바텀시트) */
  const [regionGroupName, setRegionGroupName] = useState("");
  const [regionSubName, setRegionSubName] = useState("");
  const [showRegion, setShowRegion] = useState(false);
  const [regionStep, setRegionStep] = useState<"group" | "sub">("group");
  const [selectedGroup, setSelectedGroup] = useState<RegionGroup | null>(null);

  // region 필드에 저장될 값: "경북 - 구미시" 형태
  const regionDisplay = regionGroupName && regionSubName
    ? `${regionGroupName} - ${regionSubName}`
    : "";

  const handleRegionSelect = (groupName: string, subName: string) => {
    setRegionGroupName(groupName);
    setRegionSubName(subName);
    setRegionError(false);
    setShowRegion(false);
  };

  async function handleSubmit(formData: FormData) {
    const title = (formData.get("title") as string)?.trim() ?? "";
    const content = richContent.replace(/<[^>]*>/g, "").trim();
    const region = (formData.get("region") as string) ?? "";

    if (!nickname) { alert("닉네임을 먼저 설정해주세요. MY 페이지에서 설정할 수 있습니다."); return; }

    const tErr = !title;
    const cErr = !content;
    const rErr = !region;

    setTitleError(tErr);
    setContentError(cErr);
    setRegionError(rErr);

    if (tErr || cErr || rErr) return;

    // 닉네임과 UID 자동 설정
    formData.set("author", nickname);
    formData.set("password", user?.uid || "");
    formData.set("tags", selectedExamType);
    formData.set("content", richContent);
    setPendingData(formData);
    setShowConfirm(true);
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    const remaining = 3 - selectedImages.length;
    if (remaining <= 0) { alert("최대 3장까지 가능합니다"); return; }
    setSelectedImages((prev) => [...prev, ...files.slice(0, remaining)]);
    e.target.value = "";
  }

  function removeImage(index: number) {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleConfirm() {
    if (!pendingData) return;
    const token = await getIdToken();
    if (!token) { alert("로그인이 필요합니다"); setShowConfirm(false); return; }

    let imageUrls = "";
    if (selectedImages.length > 0) {
      setUploading(true);
      try {
        const uploadData = new FormData();
        selectedImages.forEach((f) => uploadData.append("images", f));
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: uploadData,
        });
        const json = await res.json();
        if (!res.ok) { alert(json.error || "이미지 업로드 실패"); setUploading(false); setShowConfirm(false); return; }
        imageUrls = json.urls.join(",");
      } catch {
        alert("이미지 업로드 중 오류가 발생했습니다");
        setUploading(false);
        setShowConfirm(false);
        return;
      }
      setUploading(false);
    }

    pendingData.set("id_token", token);
    pendingData.set("images", imageUrls);
    const result = await createPost(pendingData);
    if (result?.error) {
      alert(result.error);
      setShowConfirm(false);
      return;
    }
    router.push(`/category/${categoryId}`);
  }

  const inputBase = "w-full rounded-xl border bg-[#FBF7EB] dark:bg-zinc-800 px-4 py-3 text-[14px] text-[#2A251D] dark:text-zinc-100 focus:outline-none transition-colors";

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F4EC] dark:bg-zinc-950 pb-10">
      <div className="mx-auto w-full max-w-lg md:max-w-3xl lg:max-w-4xl">
        {/* 헤더 바 */}
        <header className="sticky top-14 z-30 bg-[#F8F4EC]/85 dark:bg-zinc-950/85 backdrop-blur-md border-b border-[#E8E0D0]/70 dark:border-zinc-800">
          <div className="flex items-center gap-2 px-4 sm:px-6 py-3">
            <Link
              href={`/category/${categoryId}`}
              className="inline-flex items-center gap-1.5 -ml-1 px-1 py-0.5 rounded-lg text-[#6B7B3A] hover:bg-[#F5F0E5]/60 dark:hover:bg-zinc-800 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-[11px] font-bold tracking-[0.15em] uppercase">Back to Board</span>
            </Link>
          </div>
        </header>

        <form
          ref={formRef}
          onSubmit={(e) => { e.preventDefault(); handleSubmit(new FormData(formRef.current!)); }}
          className="flex flex-col px-4 sm:px-6 py-6 space-y-5"
        >
          <input type="hidden" name="category_id" value={categoryId} />
          <input type="hidden" name="tags" value={selectedExamType} />

          {/* 히어로 인트로 */}
          <section className="relative bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-6 sm:p-8 overflow-hidden shadow-[0_1px_0_rgba(0,0,0,0.02),0_12px_32px_-20px_rgba(107,93,71,0.2)]">
            <div aria-hidden className="absolute -top-20 -right-16 w-56 h-56 rounded-full bg-[#6B7B3A]/[0.06] blur-3xl pointer-events-none" />
            <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/30 to-transparent" />

            <div className="relative">
              <div className="inline-flex items-center gap-2 mb-3">
                <span className="w-6 h-px bg-[#6B7B3A]" />
                <span className="text-[11px] font-bold tracking-[0.15em] text-[#6B7B3A] uppercase">Share Your Experience</span>
              </div>
              <h1 className="text-[22px] sm:text-[26px] font-bold text-[#2A251D] dark:text-zinc-100 leading-tight tracking-tight mb-2">
                나의 경험을 후기로 남겨보세요
              </h1>
              <p className="text-[13px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed max-w-md">
                시험장 분위기, 실기 동작, 구술 질문 등 작은 경험이 다음 수험생에게 큰 도움이 됩니다.
              </p>
            </div>
          </section>

          {/* ─── 섹션 1: 기본 정보 ─── */}
          <Section number={1} title="기본 정보" subtitle="작성자와 지역을 확인해 주세요">
            <div>
              <FieldLabel>작성자</FieldLabel>
              <div className="w-full rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB]/70 dark:bg-zinc-800 px-4 py-3 text-[14px] text-[#3A342A] dark:text-zinc-100 font-medium">
                {nickname || (
                  <span className="text-[#A89B80]">닉네임을 설정해주세요</span>
                )}
              </div>
            </div>

            <div>
              <FieldLabel required>지역 선택</FieldLabel>
              <input type="hidden" name="region" value={regionDisplay} />
              <button
                type="button"
                onClick={() => { setShowRegion(true); setRegionStep("group"); }}
                className={`w-full flex items-center justify-between rounded-xl border bg-[#FBF7EB] dark:bg-zinc-800 px-4 py-3 text-[14px] text-left transition-colors ${
                  regionError
                    ? "border-[#C0392B]"
                    : regionDisplay
                      ? "border-[#6B7B3A]/40 text-[#2A251D] dark:text-zinc-100 font-medium hover:border-[#6B7B3A]/50"
                      : "border-[#E8E0D0] dark:border-zinc-700 text-[#A89B80] hover:border-[#6B7B3A]/50"
                }`}
              >
                <span className="inline-flex items-center gap-2 truncate">
                  <svg className={`w-4 h-4 shrink-0 ${regionDisplay ? "text-[#6B7B3A]" : "text-[#A89B80]"}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                  {regionDisplay || "지역을 선택하세요 (필수)"}
                </span>
                <svg className="w-4 h-4 text-[#A89B80] shrink-0 ml-2" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </Section>

          {/* ─── 섹션 2: 후기 분류 ─── */}
          <Section number={2} title="후기 분류" subtitle="어떤 유형의 후기인지 선택해 주세요">
            <div>
              <FieldLabel required>태그</FieldLabel>
              <div className="grid grid-cols-3 gap-2">
                {examTypes.map((type) => {
                  const isActive = selectedExamType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setSelectedExamType(type)}
                      className={`rounded-2xl py-3.5 text-[13px] font-bold transition-all ${
                        isActive
                          ? "bg-[#6B7B3A] text-white shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)]"
                          : "border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB] dark:bg-zinc-800 text-[#6B5D47] dark:text-zinc-300 hover:border-[#6B7B3A]/40 hover:bg-[#F5F0E5]"
                      }`}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>
          </Section>

          {/* ─── 섹션 3: 후기 내용 ─── */}
          <Section number={3} title="후기 내용" subtitle="생생하고 구체적인 경험일수록 더 큰 도움이 됩니다">
            <div>
              <FieldLabel required>제목</FieldLabel>
              <input
                name="title"
                required
                placeholder="예) 2026 서울 실기시험 - 종목별 준비 과정 후기"
                onChange={() => titleError && setTitleError(false)}
                className={`${inputBase} ${
                  titleError
                    ? "border-[#C0392B] placeholder:text-[#C0392B]/60 focus:border-[#C0392B]"
                    : "border-[#E8E0D0] dark:border-zinc-700 placeholder:text-[#A89B80] focus:border-[#6B7B3A]/50 focus:bg-[#FEFCF7] dark:focus:bg-zinc-900"
                }`}
              />
            </div>

            <div>
              <FieldLabel required>내용</FieldLabel>
              <RichEditor
                onChange={(html) => { setRichContent(html); if (contentError) setContentError(false); }}
                placeholder="시험장에서 어떤 일이 있었나요? 시험장 분위기, 실기 동작 주의점, 구술 질문 등을 공유해 주세요."
              />
              {contentError && <p className="mt-1.5 text-[11px] text-[#C0392B]">내용을 입력해주세요</p>}
              <p className="mt-2 text-[11px] text-[#A89B80] px-0.5">
                ℹ️ 욕설·비방·광고·개인정보가 포함된 글은 삭제될 수 있습니다.
              </p>
            </div>

            <div>
              <FieldLabel>사진 첨부 (최대 3장)</FieldLabel>
              <div className="flex flex-wrap gap-3">
                {selectedImages.map((file, i) => (
                  <div key={i} className="relative w-24 h-24 rounded-xl overflow-hidden border border-[#E8E0D0] dark:border-zinc-700">
                    <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-[11px] flex items-center justify-center"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {selectedImages.length < 3 && (
                  <label className="flex items-center justify-center w-24 h-24 rounded-xl border-2 border-dashed border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB] dark:bg-zinc-800 cursor-pointer hover:border-[#6B7B3A]/50 transition-colors">
                    <div className="text-center">
                      <svg className="w-6 h-6 mx-auto text-[#A89B80]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                      <span className="text-[10px] text-[#A89B80] mt-1 block">{selectedImages.length}/3</span>
                    </div>
                    <input type="file" accept="image/*" multiple onChange={handleImageSelect} className="hidden" />
                  </label>
                )}
              </div>
            </div>
          </Section>

          {/* ─── 취소 / 등록 CTA ─── */}
          <div className="flex gap-2.5 pt-1">
            <Link
              href={`/category/${categoryId}`}
              className="flex flex-1 items-center justify-center rounded-2xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 py-3.5 text-[14px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors"
            >
              취소
            </Link>
            <button
              type="submit"
              className="flex flex-[2] items-center justify-center gap-2 rounded-2xl bg-[#6B7B3A] hover:bg-[#5A6930] py-3.5 text-[14px] font-bold text-white shadow-[0_8px_24px_-8px_rgba(107,123,58,0.5)] hover:-translate-y-0.5 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
              </svg>
              후기 등록하기
            </button>
          </div>
        </form>

        {/* 지역 선택 바텀시트 */}
        {showRegion && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-[#2A251D]/50 backdrop-blur-sm" onClick={() => setShowRegion(false)} />
            <div className="relative w-full max-w-sm bg-[#FEFCF7] dark:bg-zinc-900 rounded-3xl shadow-2xl border border-[#E8E0D0] dark:border-zinc-700 max-h-[80vh] flex flex-col overflow-hidden">
              <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/40 to-transparent" />
              {/* 헤더 */}
              <div className="px-5 pt-6 pb-4 text-center shrink-0">
                <h3 className="text-base font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight">
                  {regionStep === "group" ? "지역 선택" : selectedGroup?.name || ""}
                </h3>
                <p className="text-[12px] text-[#8C8270] dark:text-zinc-500 mt-1.5">
                  {regionStep === "group" ? "광역시·도를 먼저 선택해 주세요" : "세부 지역을 선택해 주세요"}
                </p>
              </div>

              {/* 콘텐츠 */}
              <div className="flex-1 overflow-y-auto">
                {regionStep === "group" ? (
                  <div>
                    {REGION_GROUPS.map((g) => (
                      <button
                        key={g.code}
                        type="button"
                        onClick={() => { setSelectedGroup(g); setRegionStep("sub"); }}
                        className="w-full flex items-center justify-between px-5 py-4 text-[14px] text-[#3A342A] dark:text-zinc-100 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 border-b border-[#E8E0D0]/60 dark:border-zinc-800 last:border-0 transition-colors"
                      >
                        <span>{g.name}</span>
                        <svg className="w-4 h-4 text-[#A89B80]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div>
                    <button
                      type="button"
                      onClick={() => setRegionStep("group")}
                      className="w-full flex items-center gap-1 px-5 py-3 text-[13px] text-[#8C8270] hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 border-b border-[#E8E0D0]/60 dark:border-zinc-800 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                      뒤로
                    </button>
                    {selectedGroup?.subRegions.map((s) => {
                      const isActive = regionGroupName === selectedGroup.name && regionSubName === s.name;
                      return (
                        <button
                          key={s.code}
                          type="button"
                          onClick={() => handleRegionSelect(selectedGroup.name, s.name)}
                          className={`w-full text-left px-5 py-4 text-[14px] hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 border-b border-[#E8E0D0]/60 dark:border-zinc-800 last:border-0 transition-colors ${
                            isActive ? "text-[#6B7B3A] dark:text-[#A8B87A] font-semibold bg-[#F5F0E5]/50" : "text-[#3A342A] dark:text-zinc-100"
                          }`}
                        >
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 등록 확인 모달 */}
        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-[#2A251D]/50 backdrop-blur-sm" onClick={() => setShowConfirm(false)} />
            <div className="relative w-full max-w-sm bg-[#FEFCF7] dark:bg-zinc-900 rounded-3xl shadow-2xl border border-[#E8E0D0] dark:border-zinc-700 p-6 overflow-hidden">
              <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/40 to-transparent" />
              <div className="relative">
                <div className="flex justify-center mb-3">
                  <div className="w-14 h-14 rounded-2xl bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center">
                    <svg className="w-7 h-7 text-[#6B7B3A] dark:text-[#A8B87A]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                </div>
                <h3 className="mb-2 text-center text-base font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight">
                  등록 전 한 번만 확인해 주세요
                </h3>
                <div className="mb-5 p-4 bg-[#FBF7EB] dark:bg-zinc-800/60 border border-[#E8E0D0]/70 dark:border-zinc-700 rounded-2xl">
                  <p className="text-[13px] text-[#3A342A] dark:text-zinc-300 leading-relaxed">
                    욕설, 비방, 광고, 불법 행위 등 <span className="font-semibold">서비스 이용약관에 위배되는 내용</span> 작성 시 게시글 작성이 영구적으로 금지될 수 있습니다.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowConfirm(false)}
                    className="flex flex-1 items-center justify-center rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800 py-3 text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={uploading}
                    className="flex flex-1 items-center justify-center rounded-xl bg-[#6B7B3A] hover:bg-[#5A6930] disabled:opacity-50 py-3 text-[13px] font-bold text-white shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)] transition-colors"
                  >
                    {uploading ? "업로드 중..." : "후기 등록"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
