"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./auth-provider";

/**
 * 신규 로그인 후 닉네임이 없을 때 강제로 띄우는 모달.
 * - 닫기 버튼 없음
 * - 모달 외 화면 클릭 무시
 * - ESC / 뒤로가기 차단
 * - 닉네임 설정 완료될 때까지 다른 화면 사용 불가
 */
export default function RequireNicknameModal() {
  const { user, nickname, nicknameLoaded, getIdToken, refreshNickname, setNicknameLocal } = useAuth();
  const visible = !!user && nicknameLoaded && !nickname;

  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setInput("");
      setError("");
      setSubmitting(false);
    }
  }, [visible]);

  // 모달 떠있는 동안 body scroll lock + ESC 차단
  useEffect(() => {
    if (!visible) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey, true);
    };
  }, [visible]);

  if (!visible) return null;

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (trimmed.length < 2 || trimmed.length > 8) {
      setError("닉네임은 2~8자여야 합니다.");
      return;
    }
    if (!/^[가-힣a-zA-Z0-9_]+$/.test(trimmed)) {
      setError("한글/영문/숫자/언더바만 사용 가능합니다.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      // 중복 체크
      const checkRes = await fetch(`/api/nicknames?name=${encodeURIComponent(trimmed)}`);
      const checkData = await checkRes.json();
      if (checkData?.available === false) {
        setError("이미 사용 중인 닉네임입니다.");
        setSubmitting(false);
        return;
      }
      // 등록
      const token = await getIdToken();
      if (!token) {
        setError("로그인 정보를 확인할 수 없습니다.");
        setSubmitting(false);
        return;
      }
      const res = await fetch("/api/nicknames", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: trimmed, firstSetup: true }),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        setError(data?.error || "닉네임 설정에 실패했습니다.");
        setSubmitting(false);
        return;
      }
      setNicknameLocal(trimmed);
      refreshNickname().catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "닉네임 설정에 실패했습니다.");
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="require-nickname-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#F8F4EC] dark:bg-zinc-950"
    >
      <div className="w-full max-w-md mx-4 px-6 py-8">
        <h2
          id="require-nickname-title"
          className="text-2xl font-bold text-[#2A251D] dark:text-zinc-100 mb-2"
        >
          닉네임을 설정해주세요
        </h2>
        <p className="text-sm text-[#6B5D47] dark:text-zinc-400 mb-6 leading-relaxed">
          서비스를 이용하기 전에 다른 사용자에게 보일 닉네임을 정해주세요.
        </p>
        <input
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !submitting) handleSubmit(); }}
          placeholder="2~8자 (한글·영문·숫자·언더바)"
          maxLength={16}
          autoFocus
          className={`w-full px-4 py-3 rounded-xl border-[1.5px] bg-white dark:bg-zinc-900 text-[15px] text-[#2A251D] dark:text-zinc-100 focus:outline-none ${
            error ? "border-red-500" : "border-[#E8E0D0] dark:border-zinc-700 focus:border-[#6B7B3A]"
          }`}
        />
        {error ? (
          <p className="text-[12px] text-red-600 mt-2">{error}</p>
        ) : (
          <p className="text-[12px] text-[#A89B80] dark:text-zinc-500 mt-2">
            닉네임은 21일에 한 번만 변경할 수 있습니다.
          </p>
        )}
        <button
          onClick={handleSubmit}
          disabled={submitting || input.trim().length < 2}
          className="w-full mt-6 py-3 rounded-xl bg-[#6B7B3A] text-white font-bold text-[15px] hover:bg-[#5a6830] disabled:opacity-50 transition-colors"
        >
          {submitting ? "설정 중..." : "설정 완료"}
        </button>
      </div>
    </div>
  );
}
