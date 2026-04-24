"use client";

import { useEffect, useRef } from "react";

export type UploadPhase = "idle" | "resizing" | "uploading" | "saving";

interface Props {
  phase: UploadPhase;
  uploadPercent: number;
  /** saving 단계에서 보여줄 텍스트 — "게시글 저장 중...", "수정 저장 중..." 등 */
  savingLabel?: string;
}

// 리사이즈(~50ms) + 업로드(~500ms) + 저장(~1200ms) ≈ 1800ms + 여유
const ESTIMATED_TOTAL_MS = 2200;

/**
 * 시간 기반 부드러운 진행 바 — 실제 물이 차오르듯 연속적으로 채워짐.
 *
 * 단계별로 width 를 점프시키지 않고, 시작 시점부터 ease-out 곡선으로
 * 95%까지 부드럽게 차오름. requestAnimationFrame 으로 60fps 애니메이션.
 *
 * 2.2초 예상 시간을 기준으로 하되, 실제 완료(phase → idle) 시점에
 * 컴포넌트가 언마운트되면서 자연스럽게 사라짐.
 */
export function UploadProgress({ phase, savingLabel = "저장 중..." }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const isActive = phase !== "idle";

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    if (!isActive) {
      bar.style.width = "0%";
      return;
    }

    const start = Date.now();
    let raf = 0;

    const tick = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / ESTIMATED_TOTAL_MS);
      // ease-out: 초기엔 빠르게 올라가다 점점 느려짐
      // (컵에 물이 차오르는 것과 같이 바닥에서 많이 오르고 위로 갈수록 느려짐)
      const eased = 1 - Math.pow(1 - t, 2);
      const pct = Math.min(95, eased * 95);
      bar.style.width = `${pct}%`;
      // 계속 업데이트 (실제 완료 시 컴포넌트 언마운트로 멈춤)
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isActive]);

  if (phase === "idle") return null;

  const label =
    phase === "resizing"
      ? "이미지 준비 중..."
      : phase === "uploading"
        ? "업로드 중..."
        : phase === "saving"
          ? savingLabel
          : "처리 중...";

  return (
    <div className="mb-3">
      <div className="mb-1.5 text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-400">
        {label}
      </div>
      <div className="h-2 w-full rounded-full bg-[#F5F0E5] dark:bg-zinc-800 overflow-hidden">
        <div
          ref={barRef}
          className="h-full bg-[#6B7B3A]"
          style={{ width: "0%", willChange: "width" }}
        />
      </div>
    </div>
  );
}
