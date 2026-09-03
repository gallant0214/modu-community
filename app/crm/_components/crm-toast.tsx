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
      <SaveToastBridge show={show} />
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


/* ------------------------------------------------------------------ *
 * 저장 피드백 자동화
 *
 * CRM 화면마다 저장 버튼이 100군데가 넘어서, 각 호출부에 토스트를 심는 대신
 * `/api/crm/*` 로 나가는 쓰기 요청(POST/PATCH/PUT/DELETE)이 성공하면
 * 자동으로 "저장되었습니다" 토스트를 띄운다.
 *
 * - 호출부에서 더 구체적인 문구를 show() 로 덮어쓰면 그쪽이 최종 표시된다
 *   (fetch 응답 직후 자동 토스트 → 호출부 로직 순서라 나중 것이 이긴다).
 * - 저장이 아닌 쓰기 요청(조회용 POST·키오스크 체크인 등)은 아래 목록에서 제외.
 * ------------------------------------------------------------------ */

/** 쓰기 메서드지만 '저장'이 아니라 토스트를 띄우면 안 되는 엔드포인트 */
const SILENT_API = [
  "/api/crm/bootstrap", // 진입/온보딩 (곧바로 화면 전환)
  "/api/crm/messages/preview", // 발송 대상 수 미리보기
  "/api/crm/members/thumbs", // 목록 썸네일 지연 로드(POST 지만 조회)
  "/api/crm/members/faces", // 얼굴 인식용 조회
  "/api/crm/attendances/check-in", // 출석 체크인 (자체 결과 화면 있음)
];

/** 키오스크성 전체화면 — 떠다니는 토스트가 어울리지 않아 제외 */
const SILENT_SCREEN = ["/crm/kiosk", "/crm/touch-attendance", "/touch/"];

/** 경로별 맞춤 문구 (없으면 메서드 기준 기본값) */
function messageFor(method: string, path: string): string {
  if (path.startsWith("/api/crm/sms/send")) return "문자를 발송했어요";
  if (path.startsWith("/api/crm/messages")) return "메시지를 보냈어요";
  if (path.startsWith("/api/crm/auto-messages/run")) return "자동 메세지를 실행했어요";
  if (path.startsWith("/api/crm/contracts/sign")) return "계약서를 저장했어요";
  if (path.startsWith("/api/crm/class-sessions") && method === "POST")
    return "클래스 수업을 등록했어요";
  if (path.startsWith("/api/crm/reservations") && method === "POST") return "예약이 등록되었어요";
  return method === "DELETE" ? "삭제되었습니다" : "저장되었습니다";
}

function SaveToastBridge({ show }: { show: (msg?: string) => void }) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const orig = window.fetch;
    // StrictMode 이중 마운트로 중첩 래핑되지 않게 표식 확인
    if ((orig as { __crmToast?: boolean }).__crmToast) return;

    const patched: typeof window.fetch = async (input, init) => {
      const res = await orig(input, init);
      try {
        const method = (
          init?.method ??
          (typeof input === "object" && input !== null && "method" in input
            ? (input as Request).method
            : "GET")
        ).toUpperCase();
        if (method === "GET" || method === "HEAD") return res;
        if (!res.ok) return res;

        const rawUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : (input as Request).url;
        const path = new URL(rawUrl, window.location.origin).pathname;
        if (!path.startsWith("/api/crm/")) return res;
        if (SILENT_API.some((p) => path.startsWith(p))) return res;
        if (SILENT_SCREEN.some((p) => window.location.pathname.startsWith(p))) return res;

        show(messageFor(method, path));
      } catch {
        /* 토스트는 부가 기능이라 실패해도 요청 결과에 영향 주지 않는다 */
      }
      return res;
    };
    (patched as { __crmToast?: boolean }).__crmToast = true;
    window.fetch = patched;
    return () => {
      window.fetch = orig;
    };
  }, [show]);

  return null;
}
