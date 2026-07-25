/**
 * 브라우저 내장 SpeechSynthesis 로 한국어 안내 음성 재생.
 * - messages 를 순차 재생. 각 문장 사이 짧은 공백.
 * - 이전 큐를 지우고 새로 시작 (겹치기 방지).
 * - 지원 안 하는 브라우저에서는 조용히 no-op.
 */
export function speakMessages(messages: string[]) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const clean = (messages || []).map((m) => (m ?? "").trim()).filter(Boolean);
  if (clean.length === 0) return;
  try {
    window.speechSynthesis.cancel();
    for (const text of clean) {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "ko-KR";
      utter.rate = 1.0;
      utter.pitch = 1.0;
      window.speechSynthesis.speak(utter);
    }
  } catch {
    // 브라우저 정책상 사용자 상호작용 전이면 실패할 수 있음. 조용히 무시.
  }
}
