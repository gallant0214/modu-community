"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/auth-provider";

type Mode = "solo" | "center";

export default function CrmOnboardingPage() {
  const router = useRouter();
  const { getIdToken } = useAuth();
  const [mode, setMode] = useState<Mode>("solo");
  const [centerName, setCenterName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (submitting) return;
    setError("");
    if (mode === "center" && !centerName.trim()) {
      setError("센터명을 입력해주세요");
      return;
    }
    setSubmitting(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch("/api/crm/bootstrap", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(
          mode === "solo"
            ? { mode: "solo" }
            : { mode: "center", name: centerName.trim(), phone: phone.trim() || undefined }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "등록에 실패했습니다");
      }
      router.replace("/crm/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-5 py-8 md:py-12">
      <div className="text-center mb-7">
        <h1 className="text-[20px] md:text-[22px] font-bold text-[#2A251D] dark:text-zinc-100">
          모두의 지도사 CRM 시작하기
        </h1>
        <p className="mt-2 text-[13px] text-[#6B5D47] dark:text-zinc-400">
          어떻게 사용하실 계획인가요? 한 번 선택하면 나중에 설정에서 바꿀 수 있어요.
        </p>
      </div>

      <div className="space-y-3">
        <ModeCard
          selected={mode === "solo"}
          onClick={() => setMode("solo")}
          title="개인 트레이너"
          desc="혼자 회원을 받아 수업하는 방식이에요. 별도 설정 없이 바로 시작할 수 있어요."
        />
        <ModeCard
          selected={mode === "center"}
          onClick={() => setMode("center")}
          title="센터 운영자"
          desc="여러 트레이너와 회원을 관리하는 센터를 운영해요. 센터명을 입력해 주세요."
        />
      </div>

      {mode === "center" && (
        <div className="mt-5 space-y-3">
          <Field label="센터명" required>
            <input
              type="text"
              value={centerName}
              onChange={(e) => setCenterName(e.target.value)}
              placeholder="예) 모두의 지도사 본점"
              className="w-full px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[14px] text-[#2A251D] dark:text-zinc-100 placeholder:text-[#A89B80] focus:outline-none focus:border-[#6B7B3A]"
            />
          </Field>
          <Field label="연락처">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-1234-5678"
              className="w-full px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[14px] text-[#2A251D] dark:text-zinc-100 placeholder:text-[#A89B80] focus:outline-none focus:border-[#6B7B3A]"
            />
          </Field>
        </div>
      )}

      {error && (
        <div className="mt-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <button
        onClick={submit}
        disabled={submitting}
        className="mt-6 w-full px-4 py-3 rounded-lg bg-[#6B7B3A] disabled:opacity-60 text-white text-[15px] font-semibold hover:bg-[#5a6932] transition-colors"
      >
        {submitting ? "등록 중…" : "시작하기"}
      </button>
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
