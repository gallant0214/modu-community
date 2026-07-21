/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";

// face-api.js (@vladmandic/face-api) CDN — 런타임 로드(번들 미포함)
const FACEAPI_SRC = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js";
const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/";
// 매칭 거리 임계값(작을수록 엄격). 저해상도 1장 등록 기준 보수적으로 0.52
const MATCH_THRESHOLD = 0.52;
// 같은 회원 재인식 무시 시간(ms)
const COOLDOWN_MS = 60_000;

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
  face_image_data: string | null;
}

type Stage = "init" | "models" | "faces" | "ready" | "error";

/**
 * 얼굴인식 출석 — 카메라 상시 활성 + 등록 얼굴과 실시간 매칭 → 자동 체크인.
 * face_image_data(등록 사진)로 브라우저에서 디스크립터를 계산해 매칭.
 */
export default function FaceAttendance() {
  const { getIdToken } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const matcherRef = useRef<any>(null);
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

  const checkin = useCallback(
    async (memberId: number, name: string) => {
      try {
        const token = await getIdToken();
        const res = await fetch("/api/crm/attendances/check-in", {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ member_id: memberId, source: "touch" }),
        });
        const data = await res.json();
        if (res.ok) {
          setLastHit({ name: data.member?.name ?? name, at: Date.now() });
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
        if (video && video.readyState >= 2 && matcherRef.current && !busyRef.current) {
          busyRef.current = true;
          try {
            const det = await faceapi
              .detectSingleFace(video, opt)
              .withFaceLandmarks()
              .withFaceDescriptor();
            if (det?.descriptor) {
              const best = matcherRef.current.findBestMatch(det.descriptor);
              if (best.label !== "unknown") {
                const memberId = Number(best.label);
                const now = Date.now();
                const last = cooldownRef.current.get(memberId) ?? 0;
                const name = nameMapRef.current.get(memberId) ?? "회원";
                if (now - last > COOLDOWN_MS) {
                  cooldownRef.current.set(memberId, now);
                  setStatus(`${name} 인식 (거리 ${best.distance.toFixed(2)})`);
                  await checkin(memberId, name);
                } else {
                  setStatus(`${name} · 이미 출석 처리됨`);
                }
              } else {
                setStatus(`미등록 얼굴 (거리 ${best.distance.toFixed(2)})`);
              }
            } else {
              setStatus("얼굴을 카메라에 비춰 주세요");
            }
          } catch {
            /* 프레임 스킵 */
          } finally {
            busyRef.current = false;
          }
        }
        if (runningRef.current) setTimeout(tick, 500);
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
      // 모델·매처가 이미 준비됐으면 루프 시작
      if (matcherRef.current && faceApiRef.current && optRef.current && !runningRef.current) {
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
        const token = await getIdToken();
        const res = await fetch("/api/crm/members/faces", {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "등록 얼굴 조회 실패");
        const faces: FaceRow[] = (data.faces ?? []).filter((f: FaceRow) => f.face_image_data);
        if (cancelled) return;

        const opt = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 });
        optRef.current = opt;
        const labeled: any[] = [];
        let skipped = 0;
        setProgress({ done: 0, total: faces.length, skipped: 0 });
        for (let i = 0; i < faces.length; i++) {
          if (cancelled) return;
          const f = faces[i];
          try {
            const img = new Image();
            img.src = f.face_image_data as string;
            await img.decode();
            const det = await faceapi
              .detectSingleFace(img, opt)
              .withFaceLandmarks()
              .withFaceDescriptor();
            if (det?.descriptor) {
              labeled.push(new faceapi.LabeledFaceDescriptors(String(f.id), [det.descriptor]));
              nameMapRef.current.set(f.id, f.name);
            } else {
              skipped++;
            }
          } catch {
            skipped++;
          }
          setProgress({ done: i + 1, total: faces.length, skipped });
        }
        if (cancelled) return;
        if (labeled.length === 0) {
          throw new Error("사진에서 얼굴을 추출하지 못했습니다. 등록 사진 품질을 확인해 주세요.");
        }
        matcherRef.current = new faceapi.FaceMatcher(labeled, MATCH_THRESHOLD);

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

  return (
    <div className="w-full max-w-[min(94vw,720px)] flex flex-col items-center">
      <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden border-2 border-[#E8E0D0] dark:border-zinc-700 bg-black">
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
      </div>

      {stage === "ready" && (
        <div className="mt-3 text-center">
          <div className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">{status}</div>
          <div className="mt-0.5 text-[12px] text-[#A89B80]">
            등록 얼굴 {progress.total - progress.skipped}명 학습됨
            {progress.skipped > 0 && ` · 사진 인식불가 ${progress.skipped}명`}
          </div>
        </div>
      )}
    </div>
  );
}
