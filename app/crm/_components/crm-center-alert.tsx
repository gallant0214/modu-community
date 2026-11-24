"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 화면(결제창) 가운데에 잠깐 떴다가 사라지는 안내.
 * 예: 판매자를 고르지 않고 [결제하기] 를 눌렀을 때 "판매자를 선택해 주세요".
 *
 * const [alertNode, showAlert] = useCrmCenterAlert();
 * showAlert("판매자를 선택해 주세요");
 * return <>{...}{alertNode}</>;
 */
export function useCrmCenterAlert(durationMs = 1600) {
  const [message, setMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const show = useCallback(
    (msg: string) => {
      clearTimers();
      setMessage(msg);
      setVisible(false);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      timers.current.push(setTimeout(() => setVisible(false), durationMs));
      timers.current.push(setTimeout(() => setMessage(null), durationMs + 350));
    },
    [durationMs],
  );

  useEffect(() => () => clearTimers(), []);

  const node = message ? (
    <div
      role="alert"
      aria-live="assertive"
      className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center px-6"
    >
      <div
        className={`flex items-center gap-2.5 rounded-2xl bg-[#2A251D]/92 dark:bg-zinc-100/95 px-6 py-4 shadow-[0_16px_40px_-10px_rgba(0,0,0,0.55)] backdrop-blur-md transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          visible ? "scale-100 opacity-100" : "scale-[0.92] opacity-0"
        }`}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E0A04A] text-white">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2}>
            <path strokeLinecap="round" d="M12 7v6" />
            <path strokeLinecap="round" d="M12 17h.01" />
          </svg>
        </span>
        <span className="text-[15px] font-semibold tracking-tight text-white dark:text-zinc-900">{message}</span>
      </div>
    </div>
  ) : null;

  return [node, show] as const;
}
