"use client";

/**
 * 공유 기능 헬퍼
 * - navigator.share 지원 시 → OS 네이티브 공유 시트
 * - 미지원 시 → 클립보드 복사
 * - 클립보드도 실패 시 → document.execCommand fallback
 */
export async function shareOrCopy(data: { title: string; text: string; url: string }): Promise<"shared" | "copied" | "error"> {
  // 1. navigator.share (모바일/지원 브라우저)
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share(data);
      return "shared";
    } catch (e: any) {
      // 사용자가 취소한 경우는 에러가 아님
      if (e?.name === "AbortError") return "shared";
      // 다른 에러는 fallback으로 진행
    }
  }

  // 2. navigator.clipboard (대부분의 모던 브라우저)
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(data.url);
      return "copied";
    } catch {}
  }

  // 3. document.execCommand('copy') fallback (구형 브라우저)
  if (typeof document !== "undefined") {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = data.url;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textArea);
      if (ok) return "copied";
    } catch {}
  }

  // 4. 최종 fallback: prompt로 URL 표시
  if (typeof window !== "undefined") {
    window.prompt("아래 링크를 복사하세요:", data.url);
    return "copied";
  }

  return "error";
}
