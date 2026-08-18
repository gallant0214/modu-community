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

/**
 * 경고음(비프) 재생 — 회원권 만료/입장 권한 없는 회원 출석 시.
 * 별도 오디오 파일 없이 Web Audio 로 짧은 비프 3회. 지원 안 하면 no-op.
 */
export function playWarningBeep() {
  if (typeof window === "undefined") return;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const now = ctx.currentTime;
    const beeps = [0, 0.22, 0.44]; // 비프 3회
    for (const t of beeps) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = 880; // 경고 톤
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.35, now + t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.17);
    }
    setTimeout(() => ctx.close().catch(() => {}), 900);
  } catch {
    // 자동재생 정책 등으로 실패할 수 있음. 조용히 무시.
  }
}
