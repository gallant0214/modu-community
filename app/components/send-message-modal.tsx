"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/app/components/auth-provider";

interface Props {
  open: boolean;
  onClose: () => void;
  receiverNickname: string;
  parentId?: number;
  onSent?: () => void;
}

export function SendMessageModal({ open, onClose, receiverNickname, parentId, onSent }: Props) {
  const { user, getIdToken, signInWithGoogle } = useAuth();
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  if (!open) return null;

  const handleSend = async () => {
    if (!content.trim()) { setError("내용을 입력해주세요."); return; }
    setSending(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ receiver_nickname: receiverNickname, content: content.trim(), parent_id: parentId || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "전송에 실패했습니다."); return; }
      setSuccess(true);
      setContent("");
      onSent?.();
      setTimeout(() => { setSuccess(false); onClose(); }, 1200);
    } catch {
      setError("오류가 발생했습니다.");
    } finally {
      setSending(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-md bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl shadow-[0_20px_48px_-16px_rgba(107,93,71,0.4)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[#E8E0D0] dark:border-zinc-800 flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100">
            {parentId ? "답장 보내기" : "쪽지 보내기"}
          </h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-[#8C8270] hover:text-[#3A342A] hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!user ? (
            <div className="text-center py-4">
              <p className="text-sm text-[#6B5D47] dark:text-zinc-400 mb-3">로그인이 필요합니다</p>
              <button onClick={signInWithGoogle}
                className="px-5 py-2.5 bg-[#6B7B3A] hover:bg-[#5A6930] text-white text-sm font-semibold rounded-xl transition-colors">
                Google로 로그인
              </button>
            </div>
          ) : success ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#6B7B3A]/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-[#6B7B3A]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-[#6B7B3A]">쪽지를 보냈습니다</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-[12px] font-semibold text-[#8C8270] dark:text-zinc-400 mb-1.5">받는 사람</label>
                <div className="px-3 py-2.5 rounded-xl bg-[#F5F0E5] dark:bg-zinc-800 text-[13px] font-medium text-[#3A342A] dark:text-zinc-200">
                  {receiverNickname}
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#8C8270] dark:text-zinc-400 mb-1.5">내용</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="쪽지 내용을 입력하세요"
                  maxLength={1000}
                  rows={5}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[13px] text-[#3A342A] dark:text-zinc-100 placeholder-[#A89B80] focus:outline-none focus:ring-1 focus:ring-[#6B7B3A]/50 resize-none"
                />
                <p className="text-right text-[11px] text-[#A89B80] mt-1">{content.length}/1000</p>
              </div>
              {error && <p className="text-[12px] text-red-500">{error}</p>}
              <button
                onClick={handleSend}
                disabled={sending || !content.trim()}
                className="w-full py-3 bg-[#6B7B3A] hover:bg-[#5A6930] text-white text-sm font-semibold rounded-xl shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)] transition-colors disabled:opacity-50"
              >
                {sending ? "보내는 중..." : "보내기"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
