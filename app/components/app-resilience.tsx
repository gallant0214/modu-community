"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 오래 열린 탭에서 발생하는 두 가지 문제를 해결:
 *
 * 1. 백그라운드 탭 throttling — 탭이 다시 활성화되면 router.refresh()로 RSC 갱신
 *    (Firebase auth 토큰은 SDK가 자동 갱신)
 * 2. 배포 갱신으로 인한 stale JS chunk — chunk 로드 실패 시 자동 새로고침
 */
export function AppResilience() {
  const router = useRouter();

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

  useEffect(() => {
    const isChunkError = (msg: unknown) => {
      const s = String(msg || "");
      return (
        s.includes("ChunkLoadError") ||
        s.includes("Loading chunk") ||
        s.includes("Failed to fetch dynamically imported module") ||
        s.includes("Importing a module script failed")
      );
    };

    function onError(e: ErrorEvent) {
      if (isChunkError(e.message) || isChunkError(e.error?.message)) {
        // 한 번만 reload (loop 방지: sessionStorage 사용)
        try {
          if (sessionStorage.getItem("__chunk_reload__")) return;
          sessionStorage.setItem("__chunk_reload__", "1");
        } catch {}
        window.location.reload();
      }
    }
    function onUnhandledRejection(e: PromiseRejectionEvent) {
      if (isChunkError(e.reason?.message) || isChunkError(e.reason)) {
        try {
          if (sessionStorage.getItem("__chunk_reload__")) return;
          sessionStorage.setItem("__chunk_reload__", "1");
        } catch {}
        window.location.reload();
      }
    }

    // 정상 navigation 후엔 reload flag 클리어
    try {
      sessionStorage.removeItem("__chunk_reload__");
    } catch {}

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
