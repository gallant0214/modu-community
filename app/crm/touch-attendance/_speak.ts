// GC 방지: 재생 중인 utterance 참조를 모듈 레벨에 유지.
// (Chrome 버그 — 지역 변수 utterance 가 재생 도중 GC 되면 소리가 안 나거나 끊김)
let _utterRefs: SpeechSynthesisUtterance[] = [];
let _primed = false;

// ─── Web Audio (TTS 와 무관하게 확실히 나는 확인음) ───
// 맥/크롬은 await(네트워크) 뒤 새로 만든 AudioContext 가 자동재생 정책으로 suspended 되어
// 소리가 안 난다. 사용자 제스처(키패드 탭 등)에서 primeAudio() 로 미리 만들고 resume 해두면
// 이후 체크인 성공(비동기) 시점에도 확실히 소리가 난다. (한국어 음성 불필요)
let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    if (!_audioCtx) _audioCtx = new AC();
    if (_audioCtx.state === "suspended") _audioCtx.resume().catch(() => {});
  } catch {
    return null;
  }
  return _audioCtx;
}

/** 사용자 제스처에서 오디오 잠금 해제(AudioContext 생성/resume). 키패드 탭 등에서 호출. */
export function primeAudio() {
  getAudioCtx();
}

// ─── 음성 안내 볼륨/속도 설정 (기기별 localStorage) ───
const LS_VOL = "touch_voice_volume"; // 게인 배수 1~8 (기본 4)
const LS_RATE = "touch_voice_rate"; // 재생 속도 0.8~2.0 (기본 1.2)
export const VOICE_VOL_DEFAULT = 4;
export const VOICE_RATE_DEFAULT = 1.2;

export function getVoiceVolume(): number {
  if (typeof window === "undefined") return VOICE_VOL_DEFAULT;
  const v = parseFloat(window.localStorage.getItem(LS_VOL) || "");
  return Number.isFinite(v) && v > 0 ? Math.min(8, Math.max(1, v)) : VOICE_VOL_DEFAULT;
}
export function setVoiceVolume(v: number) {
  try { window.localStorage.setItem(LS_VOL, String(v)); } catch { /* noop */ }
}
export function getVoiceRate(): number {
  if (typeof window === "undefined") return VOICE_RATE_DEFAULT;
  const v = parseFloat(window.localStorage.getItem(LS_RATE) || "");
  return Number.isFinite(v) && v > 0 ? Math.min(2, Math.max(0.8, v)) : VOICE_RATE_DEFAULT;
}
export function setVoiceRate(v: number) {
  try { window.localStorage.setItem(LS_RATE, String(v)); } catch { /* noop */ }
}

// 음성 성별 (female 기본 / male). Google Cloud TTS 활성 시 실제 남/여 반영.
const LS_GENDER = "touch_voice_gender";
export function getVoiceGender(): "female" | "male" {
  if (typeof window === "undefined") return "female";
  return window.localStorage.getItem(LS_GENDER) === "male" ? "male" : "female";
}
export function setVoiceGender(g: "female" | "male") {
  try { window.localStorage.setItem(LS_GENDER, g); } catch { /* noop */ }
}

function playTones(notes: { f: number; t: number; d: number; type?: OscillatorType }[]) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const n of notes) {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = n.type ?? "sine";
      osc.frequency.value = n.f;
      gain.gain.setValueAtTime(0.0001, now + n.t);
      gain.gain.exponentialRampToValueAtTime(0.9, now + n.t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + n.t);
      osc.stop(now + n.t + n.d + 0.03);
    } catch {
      /* no-op */
    }
  }
}

/** 출석 성공 확인음 — 밝은 '띠링 띠링'(2회 반복). TTS 안 되는 기기에서도 확실히 소리가 난다. */
export function playCheckinChime() {
  playTones([
    { f: 784, t: 0, d: 0.16 }, // 띠링 (G5→C6)
    { f: 1047, t: 0.13, d: 0.22 },
    { f: 784, t: 0.42, d: 0.16 }, // 띠링 (반복)
    { f: 1047, t: 0.55, d: 0.22 },
  ]);
}

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

/** MP3 ArrayBuffer 디코드 (구형 WebView 콜백형 + 최신 Promise형 모두 지원) */
function decodeAudio(ctx: AudioContext, buf: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    try {
      const p = ctx.decodeAudioData(buf, resolve, reject) as unknown as Promise<AudioBuffer> | undefined;
      if (p && typeof p.then === "function") p.then(resolve, reject);
    } catch (e) {
      reject(e);
    }
  });
}

let _voiceSrc: AudioBufferSourceNode | null = null;

/**
 * 센터에서 설정한 음성 안내를 재생.
 * 1순위: 서버 TTS(/api/tts) 로 만든 오디오를 '잠금 해제된 AudioContext'(확인음과 동일 경로)로 재생
 *   → 브라우저 TTS(SpeechSynthesis)가 없는 기기(구형 안드로이드 태블릿 등)에서도 소리가 난다.
 * 2순위(폴백): 서버 오디오 실패 시 브라우저 SpeechSynthesis (PC 등 지원 기기).
 */
export function speakMessages(messages: string[]) {
  const clean = (messages || []).map((m) => (m ?? "").trim()).filter(Boolean);
  if (clean.length === 0) return;
  if (typeof window === "undefined") return;

  const ctx = getAudioCtx();
  if (ctx) {
    // 여러 안내는 쉼표+공백으로 이어 한 번에 합성(자연스러운 끊어읽기)
    const text = clean.join(",  ");
    fetch(`/api/tts?voice=${getVoiceGender()}&text=${encodeURIComponent(text)}`, { cache: "force-cache" })
      .then((res) => {
        if (!res.ok) throw new Error(`tts ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buf) => decodeAudio(ctx, buf.slice(0)))
      .then((audioBuf) => {
        try {
          if (_voiceSrc) { try { _voiceSrc.stop(); } catch { /* noop */ } }
          const src = ctx.createBufferSource();
          src.buffer = audioBuf;
          // 말하기 속도(설정값, 기본 1.2배)
          src.playbackRate.value = getVoiceRate();
          // 볼륨(설정값 게인 부스트) → 컴프레서(리미터)로 클리핑 없이 크게
          const gain = ctx.createGain();
          gain.gain.value = getVoiceVolume();
          const comp = ctx.createDynamicsCompressor();
          comp.threshold.value = -8;
          comp.knee.value = 6;
          comp.ratio.value = 20;
          comp.attack.value = 0.002;
          comp.release.value = 0.15;
          src.connect(gain);
          gain.connect(comp);
          comp.connect(ctx.destination);
          _voiceSrc = src;
          // 확인음(띠링 띠링, 약 0.8초)과 겹치지 않게 그 뒤에 시작
          src.start(ctx.currentTime + 0.85);
        } catch { /* noop */ }
      })
      .catch(() => {
        // 서버 TTS 실패 → 브라우저 TTS 폴백(가능한 기기에서만)
        speakViaSynthesis(clean);
      });
    return;
  }
  // AudioContext 자체가 없으면 브라우저 TTS 폴백
  speakViaSynthesis(clean);
}

/** 브라우저 내장 SpeechSynthesis 폴백 (지원 안 하는 기기에서는 no-op). */
function speakViaSynthesis(messages: string[]) {
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
  // 제스처에서 미리 활성화된 공용 AudioContext 사용(맥/크롬 await 후 새 컨텍스트 차단 회피).
  playTones([
    { f: 880, t: 0, d: 0.16, type: "square" },
    { f: 880, t: 0.22, d: 0.16, type: "square" },
    { f: 880, t: 0.44, d: 0.16, type: "square" },
  ]);
}
