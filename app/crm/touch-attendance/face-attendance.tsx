/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { speakMessages, playWarningBeep } from "./_speak";

// face-api.js (@vladmandic/face-api) CDN — 런타임 로드(번들 미포함)
const FACEAPI_SRC = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js";
const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/";
// 매칭 거리 기본 임계값(작을수록 엄격). UI 슬라이더로 실시간 조절
const DEFAULT_THRESHOLD = 0.45;
// 1등이 2등(다른 사람)보다 이만큼 더 가까워야 인정 — 애매하면 거부(오인식 방지)
const MARGIN = 0.05;
// 연속 N프레임 동일 인물로 확인돼야 출석 처리 — 순간 오인식 차단
const REQUIRED_FRAMES = 3;
// 얼굴 박스 최소 너비(px). 너무 작으면(멀면) 디스크립터 품질 낮아 스킵
const MIN_FACE_PX = 110;
// 같은 회원 재인식 무시 시간(ms)
// 얼굴 출석: 같은 회원이 2시간 이내 다시 인식돼도 재출석으로 인정하지 않음.
const COOLDOWN_MS = 2 * 60 * 60 * 1000;

let scriptPromise: Promise<any> | null = null;
function loadFaceApi(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if ((window as any).faceapi) return Promise.resolve((window as any).faceapi);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = FACEAPI_SRC;
    s.async = true;
    s.onload = () => resolve((window as any).faceapi);
    s.onerror = () => reject(new Error("얼굴인식 라이브러리 로드 실패 (네트워크 확인)"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

interface FaceRow {
  id: number;
  name: string;
  face_image_data?: string | null;
  face_descriptor?: number[] | null;
}

type Stage = "init" | "models" | "faces" | "ready" | "error";

/**
 * 얼굴인식 출석 — 카메라 상시 활성 + 등록 얼굴과 실시간 매칭 → 자동 체크인.
 * face_image_data(등록 사진)로 브라우저에서 디스크립터를 계산해 매칭.
 */
/**
 * @param fill true 이면 부모 flex 컨테이너를 꽉 채우도록 내부 max-width 를 해제.
 * '번호+얼굴' 모드처럼 카메라를 다른 UI와 나란히 놓을 때 사용.
 */
export default function FaceAttendance({
  fill = false,
  kioskToken,
}: { fill?: boolean; kioskToken?: string } = {}) {
  const kiosk = !!kioskToken;
  const { getIdToken } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const labeledRef = useRef<{ id: number; descriptor: Float32Array }[]>([]);
  const readyRef = useRef(false);
  const pendingRef = useRef<{ id: number; count: number }>({ id: 0, count: 0 });
  const thresholdRef = useRef(DEFAULT_THRESHOLD);
  const nameMapRef = useRef<Map<number, string>>(new Map());
  const cooldownRef = useRef<Map<number, number>>(new Map());
  const runningRef = useRef(false);
  const busyRef = useRef(false);
  const faceApiRef = useRef<any>(null);
  const optRef = useRef<any>(null);

  const [stage, setStage] = useState<Stage>("init");
  const [progress, setProgress] = useState({ done: 0, total: 0, skipped: 0 });
  const [error, setError] = useState("");
  const [camError, setCamError] = useState("");
  const [status, setStatus] = useState("준비 중…");
  const [lastHit, setLastHit] = useState<{ name: string; at: number } | null>(null);

  // 임계값(정밀도)은 터치출석 설정에서 관리 — 여기서는 조회만.
  // 공개(kiosk) 모드는 로그인 없이 접근하므로 faces 응답에서 threshold 를 받는다(여기선 스킵).
  useEffect(() => {
    if (kiosk) return;
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch("/api/crm/touch-attendance-settings", {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        const raw = Number(data?.settings?.face_threshold);
        if (Number.isFinite(raw) && raw >= 0.3 && raw <= 0.7) {
          thresholdRef.current = raw;
        }
      } catch {
        /* 실패해도 기본값 유지 */
      }
    })();
  }, [getIdToken]);

  const checkin = useCallback(
    async (memberId: number, name: string) => {
      try {
        const res = kiosk
          ? await fetch(`/api/touch/${kioskToken}/check-in`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ member_id: memberId, source: "touch_face" }),
            })
          : await fetch("/api/crm/attendances/check-in", {
              method: "POST",
              headers: {
                authorization: `Bearer ${await getIdToken()}`,
                "content-type": "application/json",
              },
              body: JSON.stringify({ member_id: memberId, source: "touch_face" }),
            });
        const data = await res.json();
        if (res.ok) {
          const who = data.member?.name ?? name;
          if (data.duplicate) {
            // 2시간 이내 이미 출석 → 재출석 불인정, 안내만.
            setStatus(`${who} · 이미 출석하셨습니다`);
          } else {
            setLastHit({ name: who, at: Date.now() });
            // 회원권 만료/입장 권한 없음(유효 이용권 없음) → 경고음
            if (data.summary && data.summary.can_enter === false) playWarningBeep();
            // 서버가 매칭한 안내 음성 재생
            speakMessages(Array.isArray(data.voice_messages) ? data.voice_messages : []);
          }
        }
      } catch {
        /* 무시 - 다음 프레임에 재시도 */
      }
    },
    [getIdToken]
  );

  // 인식 루프
  const loop = useCallback(
    (faceapi: any, opt: any) => {
      const tick = async () => {
        if (!runningRef.current) return;
        const video = videoRef.current;
        if (video && video.readyState >= 2 && readyRef.current && !busyRef.current) {
          busyRef.current = true;
          try {
            const det = await faceapi
              .detectSingleFace(video, opt)
              .withFaceLandmarks()
              .withFaceDescriptor();
            if (det?.descriptor) {
              // 얼굴이 너무 작으면(멀면) 스킵 — 저품질 디스크립터 오인식 방지
              const boxW = det.detection?.box?.width ?? 0;
              if (boxW < MIN_FACE_PX) {
                pendingRef.current = { id: 0, count: 0 };
                setStatus("얼굴을 카메라에 더 가까이 대주세요");
              } else {
                // 전체 등록 얼굴과 거리 계산 → 1등·2등
                const q = det.descriptor;
                const dists = labeledRef.current.map((l) => ({
                  id: l.id,
                  dist: faceapi.euclideanDistance(q, l.descriptor) as number,
                }));
                dists.sort((a, b) => a.dist - b.dist);
                const best = dists[0];
                const second = dists[1] ?? { id: -1, dist: Infinity };
                const th = thresholdRef.current;
                const gap = second.dist - best.dist;
                const passes = best.dist < th && gap >= MARGIN;
                const name = nameMapRef.current.get(best.id) ?? "회원";

                if (passes) {
                  const p = pendingRef.current;
                  const nextCount = p.id === best.id ? p.count + 1 : 1;
                  pendingRef.current = { id: best.id, count: nextCount };
                  const now = Date.now();
                  const last = cooldownRef.current.get(best.id) ?? 0;
                  if (nextCount >= REQUIRED_FRAMES) {
                    if (now - last > COOLDOWN_MS) {
                      cooldownRef.current.set(best.id, now);
                      pendingRef.current = { id: 0, count: 0 };
                      setStatus(`${name} 확인됨…`);
                      await checkin(best.id, name);
                    } else {
                      // 2시간 이내 재인식 → 재출석 불인정, 안내만
                      setStatus(`${name} · 이미 출석하셨습니다`);
                    }
                  } else {
                    setStatus(`${name} 확인 중… ${nextCount}/${REQUIRED_FRAMES} (거리 ${best.dist.toFixed(2)})`);
                  }
                } else {
                  pendingRef.current = { id: 0, count: 0 };
                  setStatus(
                    best.dist >= th
                      ? `일치하는 회원 없음 (거리 ${best.dist.toFixed(2)})`
                      : `판별 애매 — 다시 시도 (차이 ${gap.toFixed(2)})`
                  );
                }
              }
            } else {
              pendingRef.current = { id: 0, count: 0 };
              setStatus("얼굴을 카메라에 비춰 주세요");
            }
          } catch {
            /* 프레임 스킵 */
          } finally {
            busyRef.current = false;
          }
        }
        if (runningRef.current) setTimeout(tick, 400);
      };
      tick();
    },
    [checkin]
  );

  // 카메라 시작 (권한 요청). 성공 시 preview 표시 + 준비되면 루프 시작.
  const startCamera = useCallback(async (): Promise<boolean> => {
    setCamError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      // 모델·디스크립터가 이미 준비됐으면 루프 시작
      if (readyRef.current && faceApiRef.current && optRef.current && !runningRef.current) {
        runningRef.current = true;
        setStage("ready");
        setStatus("얼굴을 카메라에 비춰 주세요");
        loop(faceApiRef.current, optRef.current);
      }
      return true;
    } catch (e: any) {
      const name = e?.name || "";
      setCamError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "카메라 권한이 거부되었어요. 주소창의 카메라 아이콘(또는 브라우저 설정)에서 '허용'으로 바꾼 뒤 다시 시도해 주세요."
          : name === "NotFoundError" || name === "OverconstrainedError"
          ? "카메라를 찾을 수 없어요. 카메라 연결을 확인해 주세요."
          : name === "NotReadableError"
          ? "다른 앱이 카메라를 사용 중이에요. 해당 앱을 닫고 다시 시도해 주세요."
          : e?.message || "카메라를 열 수 없어요."
      );
      return false;
    }
  }, [loop]);

  // 초기화: 카메라 먼저 → 모델 → 등록 얼굴 디스크립터
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1) 카메라 먼저 켜서 즉시 프리뷰 + 권한 요청
      await startCamera();
      if (cancelled) return;
      try {
        // 2) 라이브러리 + 모델
        setStage("models");
        setStatus("얼굴인식 모델 불러오는 중…");
        const faceapi = await loadFaceApi();
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        if (cancelled) return;
        faceApiRef.current = faceapi;

        // 3) 등록 얼굴 → 디스크립터
        setStage("faces");
        setStatus("등록된 얼굴 불러오는 중…");
        const token = kiosk ? "" : await getIdToken();
        const res = kiosk
          ? await fetch(`/api/touch/${kioskToken}/faces`, { cache: "no-store" })
          : await fetch("/api/crm/members/faces", {
              headers: { authorization: `Bearer ${token}` },
              cache: "no-store",
            });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "등록 얼굴 조회 실패");
        // 공개 모드: 정밀도 임계값을 faces 응답에서 반영
        if (kiosk) {
          const raw = Number(data?.face_threshold);
          if (Number.isFinite(raw) && raw >= 0.3 && raw <= 0.7) thresholdRef.current = raw;
        }
        const faces: FaceRow[] = (data.faces ?? []).filter(
          (f: FaceRow) => (Array.isArray(f.face_descriptor) && f.face_descriptor.length > 0) || f.face_image_data
        );
        if (cancelled) return;

        // 등록 사진은 inputSize 크게(정확도 우선), 실시간 루프는 별도 opt(속도 우선)
        const enrollOpt = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 });
        const opt = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 });
        optRef.current = opt;
        const built: { id: number; descriptor: Float32Array }[] = [];
        let skipped = 0;
        setProgress({ done: 0, total: faces.length, skipped: 0 });
        for (let i = 0; i < faces.length; i++) {
          if (cancelled) return;
          const f = faces[i];
          try {
            // 저장된 디스크립터가 있으면 이미지 처리 없이 바로 사용 (빠름·일관)
            if (Array.isArray(f.face_descriptor) && f.face_descriptor.length > 0) {
              built.push({ id: f.id, descriptor: new Float32Array(f.face_descriptor) });
              nameMapRef.current.set(f.id, f.name);
            } else if (f.face_image_data) {
              // 레거시(사진만) → 계산 후 서버에 백필 저장 → 다음부터는 벡터만 내려받음
              const img = new Image();
              img.src = f.face_image_data;
              await img.decode();
              const det = await faceapi
                .detectSingleFace(img, enrollOpt)
                .withFaceLandmarks()
                .withFaceDescriptor();
              if (det?.descriptor) {
                built.push({ id: f.id, descriptor: det.descriptor });
                nameMapRef.current.set(f.id, f.name);
                // 백필(실패해도 무시 — 매칭에는 영향 없음). 공개 모드는 인증이 없어 스킵.
                if (!kiosk) {
                  fetch("/api/crm/members/faces", {
                    method: "POST",
                    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
                    body: JSON.stringify({ member_id: f.id, descriptor: Array.from(det.descriptor as Float32Array) }),
                  }).catch(() => {});
                }
              } else {
                skipped++;
              }
            } else {
              skipped++;
            }
          } catch {
            skipped++;
          }
          setProgress({ done: i + 1, total: faces.length, skipped });
        }
        if (cancelled) return;
        if (built.length === 0) {
          throw new Error("사진에서 얼굴을 추출하지 못했습니다. 등록 사진 품질을 확인해 주세요.");
        }
        labeledRef.current = built;
        readyRef.current = true;

        // 4) 카메라가 켜져 있으면 루프 시작 (아니면 재시도 성공 시 startCamera 가 시작)
        if (streamRef.current && !runningRef.current) {
          runningRef.current = true;
          setStage("ready");
          setStatus("얼굴을 카메라에 비춰 주세요");
          loop(faceapi, opt);
        }
      } catch (e) {
        if (cancelled) return;
        setStage("error");
        setError(e instanceof Error ? e.message : "초기화 실패");
      }
    })();

    return () => {
      cancelled = true;
      runningRef.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getIdToken, startCamera]);

  // 인식 성공 배너 자동 사라짐
  useEffect(() => {
    if (!lastHit) return;
    const t = setTimeout(() => setLastHit(null), 3500);
    return () => clearTimeout(t);
  }, [lastHit]);

  const loadingPct =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const boxClass =
    "rounded-2xl overflow-hidden border-2 border-[#E8E0D0] dark:border-zinc-700 bg-black";
  // 카메라 박스 내부(영상 + 오버레이) — 두 레이아웃 공용.
  const boxInner = (
    <>
      <video
        ref={videoRef}
        muted
        playsInline
        className="w-full h-full object-cover scale-x-[-1]"
      />
      {!camError && stage !== "ready" && stage !== "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white text-center px-6">
          <div className="text-[15px] font-semibold mb-2">{status}</div>
          {stage === "faces" && progress.total > 0 && (
            <>
              <div className="w-[70%] max-w-[280px] h-2 rounded-full bg-white/20 overflow-hidden">
                <div className="h-full bg-[#8Fb54A]" style={{ width: `${loadingPct}%` }} />
              </div>
              <div className="mt-2 text-[12.5px] text-white/80">
                얼굴 학습 {progress.done}/{progress.total}
                {progress.skipped > 0 && ` · 인식불가 ${progress.skipped}`}
              </div>
            </>
          )}
        </div>
      )}
      {camError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 text-center px-6 gap-3">
          <div className="text-[14px] font-semibold text-red-300 leading-relaxed">{camError}</div>
          <button
            onClick={() => startCamera()}
            className="px-5 py-2.5 rounded-lg bg-[#6B7B3A] text-white text-[14px] font-bold hover:bg-[#5a6932]"
          >
            카메라 다시 시도
          </button>
        </div>
      )}
      {!camError && stage === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-center px-6">
          <div className="text-[14px] font-semibold text-red-300">{error}</div>
        </div>
      )}
      {/* 인식 성공 배너 */}
      {lastHit && (
        <div className="absolute inset-x-0 bottom-0 py-3 bg-[#6B7B3A]/90 text-white text-center">
          <div className="text-[13px]">출석 완료</div>
          <div className="text-[22px] font-bold">{lastHit.name}</div>
        </div>
      )}
    </>
  );

  const statusFooter = stage === "ready" && (
    <div className={`w-full text-center ${fill ? "shrink-0 mt-2" : "mt-3"}`}>
      <div className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">{status}</div>
      <div className="mt-0.5 text-[12px] text-[#A89B80]">
        등록 얼굴 {progress.total - progress.skipped}명 학습됨
        {progress.skipped > 0 && ` · 사진 인식불가 ${progress.skipped}명`}
      </div>
    </div>
  );

  // fill: 부모가 준 높이/너비 안에서 '가장 큰 4:3 박스'로 꽉 채워 위아래 잘림 방지.
  if (fill) {
    return (
      <div className="w-full h-full min-h-0 flex flex-col items-center">
        <div className="flex-1 min-h-0 w-full flex items-center justify-center">
          <div className="relative h-full w-full">
            <div className={`absolute inset-0 m-auto aspect-[4/3] max-h-full max-w-full ${boxClass}`}>
              {boxInner}
            </div>
          </div>
        </div>
        {statusFooter}
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center max-w-[min(94vw,720px)]">
      <div className={`relative w-full aspect-[4/3] ${boxClass}`}>{boxInner}</div>
      {statusFooter}
    </div>
  );
}
