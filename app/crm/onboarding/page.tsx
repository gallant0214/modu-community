"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/auth-provider";

type Mode = "solo" | "center";
type Step = "mode" | "center-action" | "center-register" | "center-search";

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

  // 디바운스 검색 (입력 후 300ms)
  useEffect(() => {
    if (step !== "center-search") return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearched(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        setSearching(true);
        const res = await fetch(`/api/crm/centers/search?q=${encodeURIComponent(q)}`, {
          headers: { authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) {
          setResults(data.centers ?? []);
          setSearched(true);
        }
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, step, getIdToken]);

  const submitMode = async () => {
    if (mode === "solo") {
      await submitSolo();
    } else {
      setStep("center-action");
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
      <Header step={step} onBack={() => {
        setError("");
        if (step === "center-action") setStep("mode");
        else if (step === "center-register" || step === "center-search") setStep("center-action");
      }} />

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
              title="개인 트레이너"
              desc="혼자 회원을 받아 수업해요. 별도 설정 없이 바로 시작할 수 있어요."
            />
            <ModeCard
              selected={mode === "center"}
              onClick={() => setMode("center")}
              title="센터 운영자 · 소속 트레이너"
              desc="센터를 운영하거나 센터에 소속된 트레이너예요. 다음 단계에서 센터를 등록하거나 검색할 수 있어요."
            />
          </div>
          <PrimaryButton onClick={submitMode} disabled={submitting}>
            {submitting ? "처리 중…" : "다음"}
          </PrimaryButton>
        </>
      )}

      {step === "center-action" && (
        <>
          <Title
            title="센터를 어떻게 시작할까요?"
            desc="대표이신 분은 새 센터를 등록하시고, 소속 트레이너이신 분은 이미 등록된 센터를 검색해 주세요."
          />
          <div className="space-y-3">
            <ActionCard
              onClick={() => setStep("center-register")}
              title="센터 등록하기"
              desc="대표·관리자라면 여기로. 새 센터를 만들고 트레이너·회원을 관리해요."
            />
            <ActionCard
              onClick={() => setStep("center-search")}
              title="센터 검색하기"
              desc="소속 트레이너라면 여기로. 대표님이 등록해둔 센터를 찾아 가입해요."
            />
          </div>
          <Notice>
            대표님께서 먼저 센터를 등록해두셔야 소속 트레이너가 검색·가입할 수 있어요.
          </Notice>
        </>
      )}

      {step === "center-register" && (
        <>
          <Title
            title="센터 정보 입력"
            desc="새 센터를 만들어요. 대표(센터 운영자) 권한으로 등록됩니다."
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

      {step === "center-search" && (
        <>
          <Title
            title="센터 검색"
            desc="대표님이 등록해둔 센터를 찾아 가입해요. 가입 후 대표님께서 권한을 부여하시기 전까지는 데이터가 보이지 않을 수 있어요."
          />
          <Field label="센터 이름">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="센터 이름을 입력해 주세요"
              className={inputClass}
              autoFocus
            />
          </Field>

          <div className="mt-4 min-h-[120px]">
            {searching && <ListMessage>검색 중…</ListMessage>}
            {!searching && !searched && (
              <ListMessage>센터 이름을 입력하면 결과가 표시됩니다.</ListMessage>
            )}
            {!searching && searched && results.length === 0 && (
              <ListMessage>일치하는 센터가 없습니다. 대표님께 센터 등록을 요청해 주세요.</ListMessage>
            )}
            {!searching && results.length > 0 && (
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
          </div>
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

function ActionCard({
  onClick,
  title,
  desc,
}: {
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-4 rounded-2xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 hover:border-[#6B7B3A]/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold text-[#2A251D] dark:text-zinc-100">{title}</div>
          <div className="mt-1 text-[12.5px] text-[#6B5D47] dark:text-zinc-400 leading-snug">
            {desc}
          </div>
        </div>
        <svg className="w-5 h-5 shrink-0 text-[#A89B80] dark:text-zinc-500 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
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

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 px-3.5 py-2.5 rounded-lg bg-[#FBF7EB] dark:bg-zinc-900/60 border border-[#E8E0D0]/70 dark:border-zinc-800 text-[12.5px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed">
      <strong className="font-semibold text-[#3A342A] dark:text-zinc-300">안내</strong>
      <span className="mx-1.5">·</span>
      {children}
    </div>
  );
}

function ListMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-6 text-center text-[13px] text-[#8C8270] dark:text-zinc-500 border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
      {children}
    </div>
  );
}
