"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

/**
 * 카메라로 회원 앱 QR(checkin_token)을 스캔.
 * - jsQR 로 프레임 디코드(브라우저 호환성 넓음).
 * - 같은 코드 3초 내 중복 무시. paused 동안 스캔 정지(결과 표시 중 등).
 * - 감지 시 onDetect(디코드된 문자열) 호출.
 */
export default function QrScanner({
  onDetect,
  paused,
  fill,
}: {
  onDetect: (value: string) => void;
  paused?: boolean;
  fill?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const lastRef = useRef<{ v: string; t: number }>({ v: "", t: 0 });
  const pausedRef = useRef(!!paused);
  pausedRef.current = !!paused;
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;

  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    const getStream = async () => {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
      } catch {
        return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("이 브라우저는 카메라를 지원하지 않아요.");
        return;
      }
      try {
        stream = await getStream();
      } catch {
        setError("카메라를 시작할 수 없어요. 브라우저 카메라 권한을 확인해 주세요.");
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => {});
        setReady(true);
      }

      const tick = () => {
        rafRef.current = requestAnimationFrame(tick);
        if (pausedRef.current) return;
        const vid = videoRef.current;
        const cvs = canvasRef.current;
        if (!vid || !cvs || vid.readyState < 2) return;
        const w = vid.videoWidth;
        const h = vid.videoHeight;
        if (!w || !h) return;
        cvs.width = w;
        cvs.height = h;
        const ctx = cvs.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(vid, 0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);
        const code = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
        if (code && code.data) {
          const now = Date.now();
          if (code.data === lastRef.current.v && now - lastRef.current.t < 3000) return;
          lastRef.current = { v: code.data, t: now };
          onDetectRef.current(code.data);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border-2 border-[#E8E0D0] dark:border-zinc-700 bg-black ${
        fill ? "w-full aspect-square" : "w-[min(88vw,440px)] aspect-square"
      }`}
    >
      <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />
      {/* 스캔 가이드 프레임 */}
      <div className="pointer-events-none absolute inset-[14%] rounded-2xl border-2 border-white/70" />
      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-white/80 text-[14px]">
          카메라 준비 중…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-5 text-center text-white text-[14px]">
          {error}
        </div>
      )}
      {!error && (
        <div className="absolute bottom-2 left-0 right-0 text-center text-white/90 text-[13px] font-medium">
          회원 앱의 QR을 사각형 안에 비춰 주세요
        </div>
      )}
    </div>
  );
}
