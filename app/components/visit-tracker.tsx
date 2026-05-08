"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ANALYTICS_EXCLUDE_KEY } from "@/app/lib/use-tab-analytics";

// 추적 제외 조건: tab_visits 와 동일 정책 (개발 호스트 + 사용자 토글)
function isVisitExcluded(): boolean {
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

// 페이지 이동 시 /api/track-visit 으로 비콘 전송
// - sendBeacon 우선 (페이지 unload 시도 동작 보장), 없으면 fetch keepalive
// - 봇/관리자 페이지/API 경로는 제외
export function VisitTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    if (pathname.startsWith("/admin") || pathname.startsWith("/developer")) return;
    if (pathname.startsWith("/api")) return;
    if (isVisitExcluded()) return;

    const referrer = typeof document !== "undefined" ? document.referrer || "" : "";
    const body = JSON.stringify({ path: pathname, referrer });
    const url = "/api/track-visit";

    try {
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon(url, blob);
      } else {
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      // 절대 페이지 흐름 막지 말 것
    }
  }, [pathname]);

  return null;
}
