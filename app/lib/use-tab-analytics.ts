"use client";

import { useEffect } from "react";

const SESSION_KEY = "moducm_anon_session_id";
export const ANALYTICS_EXCLUDE_KEY = "moducm_analytics_excluded";

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const sid: string = (crypto as any)?.randomUUID
      ? (crypto as any).randomUUID()
      : `sid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(SESSION_KEY, sid);
    return sid;
  } catch {
    return `sid-${Date.now()}`;
  }
}

/** 추적 제외 조건: 개발환경(localhost) 자동 제외 + 사용자가 명시적으로 토글한 경우 */
function isAnalyticsExcluded(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host.startsWith("192.168.")) {
      return true;
    }
    if (localStorage.getItem(ANALYTICS_EXCLUDE_KEY) === "true") {
      return true;
    }
  } catch {}
  return false;
}

type TabKey = "practical" | "community" | "jobs" | "trade";

/**
 * 탭 진입/이탈 시간을 익명 집계로 기록.
 * - 같은 그룹 layout 안에서 라우트 이동(예: /category/1 → /category/2)은
 *   layout 이 unmount 되지 않으므로 한 visit 으로 묶임.
 * - 탭/창 닫기, 백그라운드 전환 시 sendBeacon 으로 leave 보냄.
 */
export function useTabAnalytics(tab_key: TabKey) {
  useEffect(() => {
    if (isAnalyticsExcluded()) return;

    let visitId: number | null = null;
    let leaveSent = false;
    let cancelled = false;

    const sessionId = getOrCreateSessionId();
    if (!sessionId) return;

    fetch("/api/analytics/tab/enter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tab_key, platform: "web", session_id: sessionId }),
    })
      .then(r => r.json())
      .then(d => {
        if (!cancelled && d?.visit_id) visitId = d.visit_id;
      })
      .catch(() => {});

    const sendLeave = () => {
      if (leaveSent || !visitId) return;
      leaveSent = true;
      try {
        const body = JSON.stringify({ visit_id: visitId });
        const blob = new Blob([body], { type: "application/json" });
        if (typeof navigator !== "undefined" && navigator.sendBeacon) {
          navigator.sendBeacon("/api/analytics/tab/leave", blob);
        } else {
          fetch("/api/analytics/tab/leave", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
            keepalive: true,
          }).catch(() => {});
        }
      } catch {}
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") sendLeave();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", sendLeave);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", sendLeave);
      sendLeave();
    };
  }, [tab_key]);
}
