"use client";

import { useEffect, useState } from "react";

export type UploadPhase = "idle" | "resizing" | "uploading" | "saving";

interface Props {
  phase: UploadPhase;
  uploadPercent: number;
  /** saving 단계에서 보여줄 텍스트 — "게시글 저장 중...", "수정 저장 중..." 등 */
  savingLabel?: string;
}

/**
 * 업로드 진행률 바. 각 단계가 실제 체감 시간 비례하도록 가중치 배분:
 *  - resizing: 0 → 10% (즉시, 체감 "시작됨")
 *  - uploading: 10% → 60% (XHR 실제 진행률 기반)
 *  - saving: 60% → 95% (1.2초 동안 서서히 채우기 — DB INSERT 예상 시간)
 *  - done: 100%
 *
 * 이전 구현은 업로드가 리사이즈 덕에 빨라져 바가 순식간에 100%로 차버리고
 * 저장 단계에서 멈춰있는 문제가 있었음. 단계별 가중치로 해결.
 */
export function UploadProgress({ phase, uploadPercent, savingLabel = "저장 중..." }: Props) {
  const [savingAnim, setSavingAnim] = useState(0);

  useEffect(() => {
    if (phase !== "saving") {
      setSavingAnim(0);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      // 1.2초 동안 0 → 35 로 서서히 채움 (즉 전체 바에서 60 → 95 까지 채워짐)
      setSavingAnim(Math.min(35, (elapsed / 1200) * 35));
    }, 50);
    return () => clearInterval(interval);
  }, [phase]);

  if (phase === "idle") return null;

  const width =
    phase === "resizing"
      ? 10
      : phase === "uploading"
        ? Math.min(60, 10 + uploadPercent * 0.5)
        : phase === "saving"
          ? 60 + savingAnim
          : 100;

  const label =
    phase === "resizing"
      ? "이미지 준비 중..."
      : phase === "uploading"
        ? `업로드 중 ${uploadPercent}%`
        : phase === "saving"
          ? savingLabel
          : "처리 중...";

  const step = phase === "resizing" ? "1/3" : phase === "uploading" ? "2/3" : "3/3";

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1.5 text-[12px] text-[#6B5D47] dark:text-zinc-400">
        <span className="font-semibold">{label}</span>
        <span className="font-mono text-[11px]">{step}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-[#F5F0E5] dark:bg-zinc-800 overflow-hidden">
        <div
          className="h-full bg-[#6B7B3A] transition-[width] duration-100 ease-out"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
