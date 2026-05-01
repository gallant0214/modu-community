"use client";

import { useEffect, useState } from "react";

export interface WebPushToastData {
  title: string;
  body: string;
  href?: string;
}

interface Props {
  toast: WebPushToastData | null;
  onDismiss: () => void;
}

/** Foreground 푸시 도착 시 우상단 슬라이드 인 banner. 5초 자동 사라짐. */
export function WebPushToast({ toast, onDismiss }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 200);
    }, 5000);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 70,
        right: 12,
        left: 12,
        maxWidth: 420,
        marginLeft: "auto",
        zIndex: 9999,
        transform: visible ? "translateY(0)" : "translateY(-120%)",
        opacity: visible ? 1 : 0,
        transition: "transform 220ms ease, opacity 220ms ease",
      }}
    >
      <button
        onClick={() => {
          if (toast.href) window.location.href = toast.href;
          setVisible(false);
          setTimeout(onDismiss, 200);
        }}
        className="w-full flex items-start gap-3 px-4 py-3 rounded-2xl bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 shadow-[0_8px_24px_-8px_rgba(107,93,71,0.35)] text-left hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors"
      >
        <div className="shrink-0 w-9 h-9 rounded-full bg-[#6B7B3A]/15 flex items-center justify-center">
          <svg className="w-5 h-5 text-[#6B7B3A]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[#2A251D] dark:text-zinc-100 truncate">{toast.title}</p>
          {toast.body && (
            <p className="mt-0.5 text-xs text-[#6B5D47] dark:text-zinc-400 line-clamp-2">{toast.body}</p>
          )}
        </div>
        <span
          onClick={(e) => {
            e.stopPropagation();
            setVisible(false);
            setTimeout(onDismiss, 200);
          }}
          className="shrink-0 p-1 text-[#A89B80] hover:text-[#3A342A] cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </span>
      </button>
    </div>
  );
}
