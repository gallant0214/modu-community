"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/auth-provider";

export default function KeywordsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <KeywordsContent />
    </Suspense>
  );
}

function Loading() {
  return (
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-[#6B7B3A] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function KeywordsContent() {
  const router = useRouter();
  const { user, loading: authLoading, getIdToken } = useAuth();
  const [keywords, setKeywords] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/my"); return; }
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      try {
        const res = await fetch("/api/notifications/keywords", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setKeywords((data.keywords || []).map((k: { keyword: string }) => k.keyword));
      } catch {}
      setLoading(false);
    })();
  }, [user, authLoading, getIdToken, router]);

  async function save(next: string[]) {
    setSaving(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/notifications/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ keywords: next }),
      });
      if (res.ok) {
        setMsg("저장되었습니다");
        setTimeout(() => setMsg(null), 1500);
      }
    } catch {}
    setSaving(false);
  }

  function addKeyword() {
    const k = input.trim();
    if (!k) return;
    if (keywords.includes(k)) { setInput(""); return; }
    if (keywords.length >= 20) { setMsg("최대 20개까지 설정 가능합니다"); setTimeout(() => setMsg(null), 1500); return; }
    const next = [...keywords, k];
    setKeywords(next);
    setInput("");
    save(next);
  }

  function removeKeyword(k: string) {
    const next = keywords.filter((x) => x !== k);
    setKeywords(next);
    save(next);
  }

  if (authLoading || loading) return <Loading />;

  return (
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
        {/* Back */}
        <Link href="/my" className="inline-flex items-center gap-1.5 text-[#6B7B3A] hover:bg-[#F5F0E5]/60 dark:hover:bg-zinc-800 px-1 py-0.5 rounded-lg transition-colors">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-[11px] font-bold tracking-[0.15em] uppercase">MY 페이지</span>
        </Link>

        {/* 헤더 */}
        <div className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-11 h-11 rounded-2xl bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center">
              <svg className="w-5 h-5 text-[#6B7B3A]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
            </div>
            <div>
              <h1 className="text-[17px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight">키워드 설정</h1>
              <p className="text-[12px] text-[#8C8270] dark:text-zinc-500">관심 키워드가 포함된 새 게시글·구인글 알림을 받아요</p>
            </div>
          </div>
        </div>

        {/* 키워드 추가 */}
        <div className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-5">
          <label className="text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-400 tracking-wide block mb-2">키워드 추가 ({keywords.length}/20)</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addKeyword(); }}
              placeholder="예: 대구, 수성구, PT"
              maxLength={30}
              className="flex-1 rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB] dark:bg-zinc-800 px-4 py-3 text-[14px] text-[#2A251D] dark:text-zinc-100 placeholder:text-[#A89B80] focus:border-[#6B7B3A]/50 focus:bg-[#FEFCF7] focus:outline-none"
            />
            <button
              onClick={addKeyword}
              disabled={!input.trim() || saving}
              className="rounded-xl bg-[#6B7B3A] hover:bg-[#5A6930] px-5 py-3 text-[13px] font-bold text-white shadow-[0_4px_14px_-4px_rgba(107,123,58,0.5)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              추가
            </button>
          </div>
          {msg && <p className="mt-2 text-[11px] text-[#6B7B3A] font-semibold">{msg}</p>}
        </div>

        {/* 현재 키워드 */}
        <div className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-5">
          <h2 className="text-[12px] font-bold text-[#6B5D47] dark:text-zinc-400 tracking-wide mb-3">내 키워드</h2>
          {keywords.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-[#A89B80]">등록된 키워드가 없습니다</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {keywords.map((k) => (
                <span key={k} className="inline-flex items-center gap-1.5 rounded-full bg-[#F5F0E5] dark:bg-zinc-800 px-3 py-1.5 text-[13px] font-semibold text-[#3A342A] dark:text-zinc-200">
                  {k}
                  <button onClick={() => removeKeyword(k)} aria-label="제거" className="text-[#A89B80] hover:text-[#C0392B] transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-[#A89B80] px-4">
          웹에서 변경한 키워드는 앱에서도, 앱에서 변경한 키워드는 웹에서도 자동 동기화됩니다.
        </p>
      </div>
    </div>
  );
}
