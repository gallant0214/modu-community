// GC 방지: 재생 중인 utterance 참조를 모듈 레벨에 유지.
// (Chrome 버그 — 지역 변수 utterance 가 재생 도중 GC 되면 소리가 안 나거나 끊김)
let _utterRefs: SpeechSynthesisUtterance[] = [];
let _primed = false;

/**
 * 사용자 제스처(탭/클릭) 시점에 SpeechSynthesis 를 "잠금 해제".
 * 브라우저 자동재생 정책상, speak() 가 사용자 제스처에서 한 번 호출된 적이 없으면
 * 이후 await(네트워크) 뒤의 speak() 가 조용히 차단된다. 무음 utterance 로 미리 활성화.
 * 키패드 탭·출석 실행 등 제스처 핸들러에서 호출할 것.
 */
export function primeSpeech() {
  if (_primed) return;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    _primed = true;
    const synth = window.speechSynthesis;
    // 음성 목록 로드 트리거
    synth.getVoices();
    const u = new SpeechSynthesisUtterance(" "); // 공백(사실상 무음)
    u.volume = 0;
    synth.speak(u);
    synth.cancel(); // 즉시 큐 비우기 — 잠금 해제 효과만 남김
  } catch {
    _primed = false;
  }
}

/**
 * 브라우저 내장 SpeechSynthesis 로 한국어 안내 음성 재생.
 * - messages 를 순차 재생. 이전 큐를 지우고 새로 시작.
 * - 음성 목록 미로드 시 로드 후 재생(Chrome 최초 무음 방지).
 * - utterance 참조 유지로 GC 로 인한 무음/끊김 방지.
 * - 지원 안 하는 브라우저에서는 조용히 no-op.
 */
export function speakMessages(messages: string[]) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const clean = (messages || []).map((m) => (m ?? "").trim()).filter(Boolean);
  if (clean.length === 0) return;
  const synth = window.speechSynthesis;

  const doSpeak = () => {
    try {
      synth.cancel();
      const voices = synth.getVoices();
      const ko = voices.find((v) => (v.lang || "").toLowerCase().startsWith("ko"));
      // cancel() 직후 같은 틱에 speak() 하면 Chrome 이 드롭하는 버그 → 짧은 지연 후 재생.
      setTimeout(() => {
        try {
          if (synth.paused) synth.resume(); // 멈춤 상태 복구
          _utterRefs = [];
          for (const text of clean) {
            const utter = new SpeechSynthesisUtterance(text);
            utter.lang = "ko-KR";
            if (ko) utter.voice = ko;
            utter.rate = 1.0;
            utter.pitch = 1.0;
            _utterRefs.push(utter); // GC 방지
            synth.speak(utter);
          }
        } catch {
          /* no-op */
        }
      }, 60);
    } catch {
      /* no-op */
    }
  };

  // 음성 목록이 아직 로드 안 됐으면(최초 호출) 로드 완료 후 재생.
  if (synth.getVoices().length === 0) {
    let fired = false;
    const run = () => {
      if (fired) return;
      fired = true;
      doSpeak();
    };
    try {
      synth.addEventListener("voiceschanged", run, { once: true });
    } catch {
      /* addEventListener 미지원 */
    }
    setTimeout(run, 400); // voiceschanged 안 오는 브라우저 대비
  } else {
    doSpeak();
  }
}

export type PreviewResult =
  | { status: "ok" }
  | { status: "unsupported" }
  | { status: "no-voice-fallback"; voiceName?: string };

/**
 * 설정 화면 '미리듣기' 전용 — 사용자 클릭 제스처 안에서 '동기적으로' 즉시 재생.
 * check-in 흐름(await 뒤 지연 재생)과 달리 setTimeout/prime 없이 바로 speak() 하므로
 * PC 크롬에서 자동재생 차단·큐 드롭 없이 확실히 소리가 난다.
 * 반환값으로 원인 진단(미지원/한국어 음성 없음)을 UI 에 노출할 수 있다.
 */
export function previewSpeak(text: string): PreviewResult {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return { status: "unsupported" };
  }
  const synth = window.speechSynthesis;
  const clean = (text || "").trim();
  if (!clean) return { status: "ok" };

  let result: PreviewResult = { status: "ok" };
  const speakNow = () => {
    try {
      synth.cancel();
      if (synth.paused) synth.resume(); // Chrome paused 상태 복구
    } catch {
      /* 무시 */
    }
    const voices = synth.getVoices();
    const ko = voices.find((v) => (v.lang || "").toLowerCase().startsWith("ko"));
    const utter = new SpeechSynthesisUtterance(clean);
    if (ko) {
      utter.voice = ko;
      utter.lang = ko.lang || "ko-KR";
    } else {
      // 한국어 음성이 설치돼 있지 않으면 기본 음성으로라도 재생 (원인은 호출부에서 안내)
      utter.lang = "ko-KR";
      result = { status: "no-voice-fallback", voiceName: voices[0]?.name };
    }
    utter.rate = 1.0;
    utter.pitch = 1.0;
    utter.volume = 1.0;
    _utterRefs = [utter]; // GC 방지
    try {
      synth.speak(utter);
    } catch {
      /* 무시 */
    }
  };

  // 음성 목록이 아직 로드 전이면(최초 클릭) 로드 후 재생 — 이때는 진단 불가라 ok 로 반환.
  if (synth.getVoices().length === 0) {
    let fired = false;
    const run = () => {
      if (fired) return;
      fired = true;
      speakNow();
    };
    try {
      synth.addEventListener("voiceschanged", run, { once: true });
    } catch {
      /* 미지원 */
    }
    setTimeout(run, 250);
    return { status: "ok" };
  }
  speakNow();
  return result;
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
