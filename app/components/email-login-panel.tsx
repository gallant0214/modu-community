"use client";

import { useState } from "react";
import { useAuth } from "@/app/components/auth-provider";

/**
 * 이메일·비밀번호를 기본으로 두고 소셜을 보조로 두는 로그인 패널.
 *
 * 🚨 이메일 로그인이 **반드시** 있어야 하는 이유: PG 카드사 심사는 소셜 로그인
 *    테스트 계정을 받지 않는다. 심사원에게 줄 아이디/비밀번호가 필요하다.
 *
 * 결제가 걸린 화면(센터 이용권 구매 · CRM 이용권 구매)이 **같은 패널을 공유**한다.
 * 화면마다 복사하면 한쪽만 고쳐져 심사에서 다시 걸린다.
 */
export default function EmailLoginPanel({
  intro,
}: {
  /** 왜 로그인이 필요한지 한 줄. 화면마다 다르다 */
  intro?: string;
}) {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle, signInWithApple } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      if (mode === "in") await signInWithEmail(email, pw);
      else await signUpWithEmail(email, pw);
    } catch (e2) {
      // 🚨 실제 에러 메시지를 보존한다 — 마스킹하면 로그인 실패 원인을 알 수 없다
      setErr(e2 instanceof Error ? e2.message : "로그인에 실패했어요");
      setBusy(false);
    }
  };

  return (
    <div className="mt-6">
      {intro && <p className="text-sm leading-relaxed text-gray-600">{intro}</p>}

      <form onSubmit={submit} className="mt-4 space-y-2">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일"
          className="w-full rounded-xl border border-gray-300 px-3.5 py-3 text-sm"
        />
        <input
          type="password"
          autoComplete={mode === "in" ? "current-password" : "new-password"}
          required
          minLength={6}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="비밀번호"
          className="w-full rounded-xl border border-gray-300 px-3.5 py-3 text-sm"
        />
        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white disabled:bg-gray-300"
        >
          {busy ? "처리 중…" : mode === "in" ? "로그인" : "회원가입"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "in" ? "up" : "in");
          setErr(null);
        }}
        className="mt-2 w-full text-center text-xs text-gray-500 underline"
      >
        {mode === "in" ? "처음이신가요? 이메일로 가입하기" : "이미 계정이 있어요. 로그인하기"}
      </button>

      <div className="my-4 flex items-center gap-3">
        <span className="h-px flex-1 bg-gray-200" />
        <span className="text-xs text-gray-400">또는</span>
        <span className="h-px flex-1 bg-gray-200" />
      </div>

      <button
        type="button"
        onClick={() => signInWithGoogle()}
        className="w-full rounded-xl border border-gray-300 py-3.5 text-sm font-bold text-gray-800"
      >
        구글로 로그인
      </button>
      <button
        type="button"
        onClick={() => signInWithApple()}
        className="mt-2 w-full rounded-xl bg-black py-3.5 text-sm font-bold text-white"
      >
        Apple 로 로그인
      </button>
    </div>
  );
}
