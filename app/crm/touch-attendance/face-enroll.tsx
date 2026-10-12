"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";

interface Member {
  id: number;
  name: string;
}

/**
 * 터치출석 얼굴 미등록 회원 현장 등록 플로우.
 *
 * 🚨 2026-10-12 변경: 화면에서 받던 생체정보 수집 동의 단계를 제거하고 **바로 촬영 화면**을 띄운다.
 *    (동의는 전자계약서 '개인정보 이용 동의서'(필수 체크)의 얼굴 인식 항목으로 받는다)
 * 1) 열리면 즉시 카메라 시작 → 촬영
 * 2) 저장(POST register-face) → onDone(true)
 * 3) 카메라를 열 수 없을 때만 '얼굴 없이 출석' 으로 빠져나갈 수 있다(현장 마비 방지)
 */
export default function FaceEnroll({
  member,
  onDone,
  onCancel,
  kioskToken,
}: {
  member: Member;
  /** 완료(등록했든 미동의로 건너뛰든) → 부모가 출석 처리 */
  onDone: (registered: boolean) => void;
  onCancel: () => void;
  /** 공개 터치링크(로그인 없음) 모드면 kioskToken 으로 공개 저장 엔드포인트 사용 */
  kioskToken?: string;
}) {
  const { getIdToken } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // 동의 단계 없이 바로 촬영. (카메라 실패 시에만 건너뛰기 노출)
  const [captured, setCaptured] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setError("");
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
    } catch {
      setError("카메라를 열 수 없어요. 권한을 확인해 주세요.");
    }
  }, []);

  // 열리는 즉시 카메라 시작 → 동의 화면 없이 바로 촬영
  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  // C등급: 800x800 q82 (~150KB) — 얼굴 인식률 우선 / 썸네일 120x120 q60
  const capture = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const side = Math.min(vw, vh);
    const sx = (vw - side) / 2;
    const sy = (vh - side) / 2;

    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 800;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(video, sx, sy, side, side, 0, 0, 800, 800);
    setCaptured(c.toDataURL("image/jpeg", 0.82));
  };

  const makeThumb = (dataUrl: string): Promise<string> =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = 120;
        c.height = 120;
        const ctx = c.getContext("2d");
        if (!ctx) return resolve(dataUrl);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, 120, 120);
        resolve(c.toDataURL("image/jpeg", 0.6));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });

  const save = async () => {
    if (!captured || saving) return;
    setSaving(true);
    setError("");
    try {
      const thumb = await makeThumb(captured);
      // 공개 터치링크(kioskToken) → 인증 없는 공개 저장 엔드포인트 / 로그인 CRM → 기존 인증 엔드포인트
      const res = kioskToken
        ? await fetch(`/api/touch/${kioskToken}/register-face`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ member_id: member.id, face_image_data: captured, face_image_thumb: thumb }),
          })
        : await fetch("/api/crm/attendances/register-face", {
            method: "POST",
            headers: { authorization: `Bearer ${await getIdToken()}`, "content-type": "application/json" },
            body: JSON.stringify({ member_id: member.id, face_image_data: captured, face_image_thumb: thumb }),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "얼굴 등록 실패");
      stopCamera();
      onDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
      setSaving(false);
    }
  };

  return (
    <div className="w-full max-w-[min(92vw,460px)]">
        <div className="rounded-2xl border-2 border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
          <div className="text-center text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 mb-3">
            {member.name} 얼굴 촬영
          </div>
          <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-black">
            {captured ? (
              // 확인 화면도 촬영 때 본 모습(거울)과 같게 보여준다. 저장 파일은 원본 방향 유지(얼굴 인식 일관성)
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={captured}
                alt="촬영본"
                className="w-full h-full object-cover"
                style={{ transform: "scaleX(-1)" }}
              />
            ) : (
              <>
                {/* 거울 모드 — Tailwind scale-x 는 구형 브라우저(@property 미지원)에서 무시돼 인라인 transform 사용 */}
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                  style={{ transform: "scaleX(-1)" }}
                />
                {/* 얼굴 가이드 */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-[62%] h-[78%] rounded-[50%] border-2 border-white/70" />
                </div>
              </>
            )}
          </div>

          {/* 카메라 아래 안내 — 왜 촬영이 뜨는지 알려준다 */}
          <p className="mt-2.5 text-center text-[14px] font-semibold text-[#3A342A] dark:text-zinc-200">
            첫 등록 시에는 얼굴 등록이 필요합니다.
          </p>

          {error && (
            <div className="mt-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[12.5px] text-red-700 dark:text-red-300 text-center">
              {error}
            </div>
          )}

          <div className="mt-3 flex gap-2">
            {captured ? (
              <>
                <button
                  onClick={() => {
                    setCaptured(null);
                    setError("");
                  }}
                  disabled={saving}
                  className="flex-1 py-3.5 rounded-xl border border-[#E8E0D0] dark:border-zinc-700 text-[15px] font-semibold text-[#6B5D47] dark:text-zinc-300 disabled:opacity-50"
                >
                  다시 촬영
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="flex-1 py-3.5 rounded-xl bg-[#6B7B3A] text-white text-[15px] font-bold hover:bg-[#5a6932] disabled:opacity-60"
                >
                  {saving ? "등록 중…" : "이 사진으로 등록 + 출석"}
                </button>
              </>
            ) : (
              <button
                onClick={capture}
                className="flex-1 py-3.5 rounded-xl bg-[#6B7B3A] text-white text-[16px] font-bold hover:bg-[#5a6932]"
              >
                촬영
              </button>
            )}
          </div>
          {/* 카메라를 열 수 없을 때만 우회 — 정상 상황에서는 촬영이 필수 */}
          {error && (
            <button
              onClick={() => {
                stopCamera();
                onDone(false);
              }}
              className="mt-2 w-full py-3 rounded-xl border border-[#E8E0D0] dark:border-zinc-700 text-[14px] font-semibold text-[#6B5D47] dark:text-zinc-300"
            >
              얼굴 없이 출석하기
            </button>
          )}
          <button
            onClick={() => {
              stopCamera();
              onCancel();
            }}
            className="mt-2 w-full py-2 text-[13px] text-[#A89B80]"
          >
            취소
          </button>
        </div>
    </div>
  );
}
