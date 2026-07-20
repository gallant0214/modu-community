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

/** 너비 조절 핸들이 달린 헤더 셀 */
export function ResizableTh<K extends string>({
  colKey,
  label,
  onStart,
  className,
}: {
  colKey: K;
  label: React.ReactNode;
  onStart: (key: K, e: React.MouseEvent) => void;
  className?: string;
}) {
  return (
    <th className={`relative text-left font-medium px-3 py-2.5 ${className ?? ""}`}>
      <span className="block truncate pr-2">{label}</span>
      <span
        onMouseDown={(e) => onStart(colKey, e)}
        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-[#6B7B3A]/30"
        title="드래그해서 열 너비 조절"
      />
    </th>
  );
}
