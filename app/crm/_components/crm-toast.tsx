"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

interface ToastState {
  id: number;
  message: string;
}

const Ctx = createContext<{ show: (msg?: string) => void }>({ show: () => {} });

export function useCrmToast() {
  return useContext(Ctx);
}

/**
 * CRM 공용 토스트. 저장 성공 등에서 useCrmToast().show("저장 완료") 호출.
 * 상단 중앙에 부드럽게 나타났다(페이드+슬라이드+스케일) 잠시 후 사라진다.
 */
export function CrmToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [visible, setVisible] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const show = useCallback((msg = "저장 완료") => {
    clearTimers();
    setToast({ id: Date.now(), message: msg });
    setVisible(false);
    // 다음 프레임에 visible → 진입 애니메이션
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    timers.current.push(setTimeout(() => setVisible(false), 1700));
    timers.current.push(setTimeout(() => setToast(null), 2100));
  }, []);

  useEffect(() => () => clearTimers(), []);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-[4.75rem] z-[100] flex justify-center px-4">
          <div
            className={`pointer-events-auto flex items-center gap-2.5 rounded-full border border-black/5 bg-[#2F3A2B]/95 px-5 py-2.5 shadow-[0_10px_30px_-8px_rgba(47,58,43,0.55)] backdrop-blur-md transition-all duration-[450ms] ease-[cubic-bezier(0.16,1,0.3,1)] dark:border-white/10 dark:bg-[#A8B87A]/95 ${
              visible
                ? "translate-y-0 scale-100 opacity-100"
                : "-translate-y-2.5 scale-[0.94] opacity-0"
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/90 text-white transition-transform duration-500 ${
                visible ? "scale-100" : "scale-0"
              }`}
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <span className="text-[13.5px] font-semibold tracking-tight text-white dark:text-zinc-950">
              {toast.message}
            </span>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
