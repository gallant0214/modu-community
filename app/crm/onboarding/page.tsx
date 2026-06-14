"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/auth-provider";

type Mode = "solo" | "center";
type Step = "mode" | "center-search" | "center-register";

interface CenterSearchResult {
  id: number;
  name: string;
  region_sido: string | null;
  region_sigungu: string | null;
  phone: string | null;
}

export default function CrmOnboardingPage() {
  const router = useRouter();
  const { getIdToken } = useAuth();

  const [step, setStep] = useState<Step>("mode");
  const [mode, setMode] = useState<Mode>("solo");

  // 센터 등록 폼
  const [centerName, setCenterName] = useState("");
  const [phone, setPhone] = useState("");

  // 센터 검색
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CenterSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // 검색은 명시적 트리거 (버튼 클릭 또는 Enter). 자동 디바운스 안 함.
  const runSearch = async () => {
    const q = query.trim();
    setError("");
    if (!q) {
      setResults([]);
      setSearched(false);
      return;
    }
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      setSearching(true);
      const res = await fetch(`/api/crm/centers/search?q=${encodeURIComponent(q)}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "검색에 실패했습니다");
      }
      setResults(data.centers ?? []);
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
      setResults([]);
      setSearched(true);
    } finally {
      setSearching(false);
    }
  };

  // 검색 페이지 진입 시 입력 초기화
  useEffect(() => {
    if (step !== "center-search") {
      setSearched(false);
      setResults([]);
    }
  }, [step]);

  const submitMode = async () => {
    if (mode === "solo") {
      await submitSolo();
    } else {
      setStep("center-search");
    }
  };

  const submitSolo = async () => {
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch("/api/crm/bootstrap", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ mode: "solo" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "등록에 실패했습니다");
      router.replace("/crm/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  const submitRegister = async () => {
    if (submitting) return;
    setError("");
    if (!centerName.trim()) {
      setError("센터명을 입력해주세요");
      return;
    }
    setSubmitting(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch("/api/crm/bootstrap", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          mode: "center",
          name: centerName.trim(),
          phone: phone.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "등록에 실패했습니다");
      router.replace("/crm/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  const joinCenter = async (centerId: number) => {
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch("/api/crm/centers/join", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ centerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "가입에 실패했습니다");
      router.replace("/crm/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-5 py-8 md:py-12">
      <Header
        step={step}
        onBack={() => {
          setError("");
          if (step === "center-search") setStep("mode");
          else if (step === "center-register") setStep("center-search");
        }}
      />

      {step === "mode" && (
        <>
          <Title
            title="모두의 지도사 CRM 시작하기"
            desc="어떻게 사용하실 계획인가요? 나중에 설정에서 바꿀 수 있어요."
          />
          <div className="space-y-3">
            <ModeCard
              selected={mode === "solo"}
              onClick={() => setMode("solo")}
              title="개인 강사"
              desc="혼자 회원을 받아 수업해요. 별도 설정 없이 바로 시작할 수 있어요."
            />
            <ModeCard
              selected={mode === "center"}
              onClick={() => setMode("center")}
              title="센터 선택하기"
              desc="센터에 소속됐거나 직접 운영해요. 검색해서 가입하거나 새로 등록할 수 있어요."
            />
          </div>
          <PrimaryButton onClick={submitMode} disabled={submitting}>
            {submitting ? "처리 중…" : "다음"}
          </PrimaryButton>
        </>
      )}

      {step === "center-search" && (
        <>
          <Title
            title="센터 검색"
            desc="가입하실 센터를 검색해 주세요."
          />

          {/* 검색 입력 + 버튼 */}
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runSearch();
              }}
              placeholder="센터명을 입력하세요"
              className={`${inputClass} flex-1`}
              autoFocus
            />
            <button
              onClick={runSearch}
              disabled={searching || !query.trim()}
              className="px-4 rounded-lg bg-[#6B7B3A] disabled:opacity-60 text-white text-[14px] font-semibold hover:bg-[#5a6932] transition-colors whitespace-nowrap"
            >
              {searching ? "검색 중…" : "검색"}
            </button>
          </div>

          {/* 검색 결과 */}
          <div className="mt-5">
            {searched && results.length > 0 && (
              <ul className="space-y-2">
                {results.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => joinCenter(c.id)}
                      disabled={submitting}
                      className="w-full text-left px-4 py-3 rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 hover:border-[#6B7B3A]/50 transition-colors disabled:opacity-60"
                    >
                      <div className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
                        {c.name}
                      </div>
                      <div className="mt-0.5 text-[12px] text-[#8C8270] dark:text-zinc-500">
                        {[c.region_sido, c.region_sigungu].filter(Boolean).join(" ") || "지역 정보 없음"}
                        {c.phone && <span> · {c.phone}</span>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {searched && results.length === 0 && (
              <div className="px-4 py-5 text-center text-[13px] text-[#8C8270] dark:text-zinc-500 border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
                일치하는 센터가 없습니다.
              </div>
            )}
          </div>

          {/* 등록 안내 (항상 표시) */}
          <div className="mt-6 px-4 py-4 rounded-2xl bg-[#FBF7EB] dark:bg-zinc-900/60 border border-[#E8E0D0]/70 dark:border-zinc-800">
            <div className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">
              찾으시는 센터가 없나요?
            </div>
            <div className="mt-1 text-[12.5px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed">
              센터 등록은 대표자나 관리자만 할 수 있어요.
            </div>
            <button
              onClick={() => setStep("center-register")}
              className="mt-3 w-full px-4 py-2.5 rounded-lg border border-[#6B7B3A] text-[#6B7B3A] dark:text-[#A8B87A] dark:border-[#A8B87A] bg-transparent hover:bg-[#6B7B3A]/5 text-[14px] font-semibold transition-colors"
            >
              센터 등록하기
            </button>
          </div>
        </>
      )}

      {step === "center-register" && (
        <>
          <Title
            title="센터 정보 입력"
            desc="새 센터를 만들어요. 등록하시는 분이 대표자가 됩니다."
          />
          <div className="space-y-3">
            <Field label="센터명" required>
              <input
                type="text"
                value={centerName}
                onChange={(e) => setCenterName(e.target.value)}
                placeholder="예) 모두의 지도사 본점"
                className={inputClass}
              />
            </Field>
            <Field label="연락처">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="010-1234-5678"
                className={inputClass}
              />
            </Field>
          </div>
          <PrimaryButton onClick={submitRegister} disabled={submitting}>
            {submitting ? "등록 중…" : "센터 등록하기"}
          </PrimaryButton>
        </>
      )}

      {error && (
        <div className="mt-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}

const inputClass =
  "w-full px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[14px] text-[#2A251D] dark:text-zinc-100 placeholder:text-[#A89B80] focus:outline-none focus:border-[#6B7B3A]";

function Header({ step, onBack }: { step: Step; onBack: () => void }) {
  if (step === "mode") return null;
  return (
    <button
      onClick={onBack}
      className="flex items-center gap-1 mb-4 text-[13px] text-[#6B5D47] dark:text-zinc-400 hover:text-[#3A342A] dark:hover:text-zinc-200"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      이전 단계
    </button>
  );
}

function Title({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="text-center mb-6">
      <h1 className="text-[20px] md:text-[22px] font-bold text-[#2A251D] dark:text-zinc-100">
        {title}
      </h1>
      <p className="mt-2 text-[13px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed">
        {desc}
      </p>
    </div>
  );
}

function ModeCard({
  selected,
  onClick,
  title,
  desc,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-4 rounded-2xl border transition-colors
        ${selected
          ? "border-[#6B7B3A] bg-[#6B7B3A]/5 dark:border-[#A8B87A] dark:bg-[#6B7B3A]/15"
          : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 hover:border-[#6B7B3A]/40"
        }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0
            ${selected
              ? "border-[#6B7B3A] bg-[#6B7B3A]"
              : "border-[#A89B80] dark:border-zinc-500"
            }`}
        />
        <div>
          <div className="text-[15px] font-semibold text-[#2A251D] dark:text-zinc-100">{title}</div>
          <div className="mt-1 text-[12.5px] text-[#6B5D47] dark:text-zinc-400 leading-snug">
            {desc}
          </div>
        </div>
      </div>
    </button>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-[#3A342A] dark:text-zinc-300 mb-1.5">
        {label}
        {required && <span className="text-[#B47B2A] ml-1">*</span>}
      </span>
      {children}
    </label>
  );
}

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="mt-6 w-full px-4 py-3 rounded-lg bg-[#6B7B3A] disabled:opacity-60 text-white text-[15px] font-semibold hover:bg-[#5a6932] transition-colors"
    >
      {children}
    </button>
  );
}
