"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";

/**
 * 테이블 열 너비를 드래그로 조절 + localStorage 저장하는 훅.
 * 회원 관리 목록과 동일한 UX (핸들 드래그, 최소 56px, 300ms 디바운스 저장).
 */
export function useColumnWidths<K extends string>(
  storageKey: string,
  defaults: Record<K, number>
) {
  const [widths, setWidths] = useState<Record<K, number>>(defaults);
  // 최신 widths 를 마우스업 시점에 바로 저장하기 위한 ref
  const widthsRef = useRef(widths);
  useEffect(() => {
    widthsRef.current = widths;
  }, [widths]);

  const flush = useCallback(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(widthsRef.current));
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const obj = JSON.parse(saved) as Record<string, number>;
        setWidths((prev) => ({ ...prev, ...obj }));
      }
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setWidth = useCallback(
    (key: K, width: number) => {
      setWidths((prev) => {
        const next = { ...prev, [key]: width };
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          try {
            localStorage.setItem(storageKey, JSON.stringify(next));
          } catch {
            /* ignore */
          }
        }, 300);
        return next;
      });
    },
    [storageKey]
  );

  const resizing = useRef<{ key: K; startX: number; startW: number } | null>(null);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = resizing.current;
      if (!r) return;
      setWidth(r.key, Math.max(56, r.startW + (e.clientX - r.startX)));
    };
    const onUp = () => {
      const wasResizing = resizing.current !== null;
      resizing.current = null;
      document.body.style.cursor = "";
      // 드래그를 놓는 즉시 최종 너비를 저장 (디바운스 누락 방지)
      if (wasResizing) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        flush();
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [setWidth, flush]);

  // 언마운트(페이지 이동) 시 대기 중이던 저장을 즉시 반영
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        flush();
      }
    };
  }, [flush]);

  const startResize = useCallback(
    (key: K, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizing.current = { key, startX: e.clientX, startW: widths[key] ?? 120 };
      document.body.style.cursor = "col-resize";
    },
    [widths]
  );

  const reset = useCallback(() => {
    setWidths(defaults);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }, [storageKey, defaults]);

  const keys = Object.keys(defaults) as K[];
  const changed = keys.some((k) => widths[k] !== defaults[k]);
  const totalWidth = keys.reduce((s, k) => s + (widths[k] ?? 0), 0);

  return { widths, startResize, reset, changed, totalWidth };
}

/**
 * 정렬 표시 아이콘.
 * - none: 이중 화살표(정렬 가능하나 미정렬) — 은은한 회색
 * - asc/desc: 단일 화살표(정렬됨) — 주황(amber) 강조
 */
export function SortIndicator({ state }: { state: "none" | "asc" | "desc" }) {
  if (state === "none") {
    return (
      <svg
        viewBox="0 0 16 16"
        className="w-3 h-3 shrink-0 text-[#C7B89B] dark:text-zinc-600"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M5 6.3 L8 3.3 L11 6.3" />
        <path d="M5 9.7 L8 12.7 L11 9.7" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 16 16"
      className="w-3 h-3 shrink-0 text-[#B47B2A] dark:text-amber-400"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {state === "asc" ? (
        <path d="M8 12.5 V3.6 M4.6 7 L8 3.5 L11.4 7" />
      ) : (
        <path d="M8 3.5 V12.4 M4.6 9 L8 12.5 L11.4 9" />
      )}
    </svg>
  );
}

/**
 * 너비 조절 핸들이 달린 헤더 셀.
 * onSort 를 넘기면 라벨이 정렬 버튼이 되고 활성 컬럼에 정렬 화살표 표시(회원 관리와 동일 UX).
 */
export function ResizableTh<K extends string>({
  colKey,
  label,
  onStart,
  className,
  sortKey,
  sortDir,
  onSort,
}: {
  colKey: K;
  label: React.ReactNode;
  onStart: (key: K, e: React.MouseEvent) => void;
  className?: string;
  /** 현재 정렬 중인 컬럼 키 */
  sortKey?: K | null;
  sortDir?: "asc" | "desc";
  /** 넘기면 라벨 클릭 시 이 컬럼으로 정렬 토글 */
  onSort?: (key: K) => void;
}) {
  const active = !!onSort && sortKey === colKey;
  return (
    <th className={`relative text-left font-medium px-3 py-2.5 ${className ?? ""}`}>
      {onSort ? (
        <button
          type="button"
          onClick={() => onSort(colKey)}
          className="flex items-center gap-1 w-full pr-2 text-left hover:text-[#6B7B3A] dark:hover:text-[#A8B87A]"
          title="정렬"
        >
          <span className={`truncate ${active ? "text-[#B47B2A] dark:text-amber-300 font-semibold" : ""}`}>{label}</span>
          <SortIndicator state={active ? (sortDir ?? "asc") : "none"} />
        </button>
      ) : (
        <span className="block truncate pr-2">{label}</span>
      )}
      <span
        onMouseDown={(e) => onStart(colKey, e)}
        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-[#6B7B3A]/30"
        title="드래그해서 열 너비 조절"
      />
    </th>
  );
}
