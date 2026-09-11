"use client";

import { useEffect, useRef, useState } from "react";
import { crmInputClass } from "./crm-modal";

/**
 * 생년월일 입력 — 년(4) / 월(2) / 일(2) 분리 입력.
 *
 * 네이티브 <input type="date"> 는 브라우저(크롬)에서 연도 칸이 6자리까지 받아
 * "2026" 을 쳐도 다음 칸으로 넘어가지 않는다. 숫자 키패드로 빠르게 입력할 수 있도록
 * 자릿수가 차면 자동으로 다음 칸으로 이동한다.
 *  - 년: 4자리 입력 시 → 월
 *  - 월: 2자리 입력 시 → 일 (2~9 를 먼저 누르면 0 을 붙여 바로 이동)
 *  - 일: 2자리 입력 시 완료 (4~9 를 먼저 누르면 0 을 붙여 완료)
 *  - 빈 칸에서 Backspace → 이전 칸으로 이동
 *
 * value/onChange 는 "YYYY-MM-DD" (미완성이면 빈 문자열).
 */
export default function BirthDateInput({
  value,
  onChange,
  disabled,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const parse = (v: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? "");
    return m ? { y: m[1], mo: m[2], d: m[3] } : { y: "", mo: "", d: "" };
  };
  const [parts, setParts] = useState(() => parse(value));
  const yRef = useRef<HTMLInputElement>(null);
  const moRef = useRef<HTMLInputElement>(null);
  const dRef = useRef<HTMLInputElement>(null);

  // 외부에서 값이 바뀌면(수정 모드 로드 등) 동기화. 입력 중(부분 입력)에는 덮어쓰지 않는다.
  useEffect(() => {
    const next = parse(value);
    const cur = `${parts.y}-${parts.mo}-${parts.d}`;
    if (value && `${next.y}-${next.mo}-${next.d}` !== cur) setParts(next);
    if (!value && parts.y && parts.mo && parts.d) setParts({ y: "", mo: "", d: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (p: { y: string; mo: string; d: string }) => {
    if (p.y.length === 4 && p.mo.length === 2 && p.d.length === 2) {
      onChange(`${p.y}-${p.mo}-${p.d}`);
    } else {
      onChange("");
    }
  };

  const update = (patch: Partial<{ y: string; mo: string; d: string }>) => {
    const next = { ...parts, ...patch };
    setParts(next);
    emit(next);
  };

  const onYear = (raw: string) => {
    const v = raw.replace(/\D/g, "").slice(0, 4);
    update({ y: v });
    if (v.length === 4) moRef.current?.focus();
  };

  const onMonth = (raw: string) => {
    let v = raw.replace(/\D/g, "").slice(0, 2);
    // 2~9 를 먼저 누르면 월이 될 수 없으므로 0 을 붙여 확정 (2 → 02)
    if (v.length === 1 && Number(v) >= 2) v = `0${v}`;
    if (v.length === 2) {
      const n = Math.min(12, Math.max(1, Number(v)));
      v = String(n).padStart(2, "0");
    }
    update({ mo: v });
    if (v.length === 2) dRef.current?.focus();
  };

  const onDay = (raw: string) => {
    let v = raw.replace(/\D/g, "").slice(0, 2);
    // 4~9 를 먼저 누르면 일이 될 수 없으므로 0 을 붙여 확정 (5 → 05)
    if (v.length === 1 && Number(v) >= 4) v = `0${v}`;
    if (v.length === 2) {
      const n = Math.min(31, Math.max(1, Number(v)));
      v = String(n).padStart(2, "0");
    }
    update({ d: v });
  };

  /** 빈 칸에서 Backspace → 이전 칸으로 */
  const backspaceTo = (
    e: React.KeyboardEvent<HTMLInputElement>,
    cur: string,
    prev: React.RefObject<HTMLInputElement | null>
  ) => {
    if (e.key === "Backspace" && cur === "") {
      e.preventDefault();
      prev.current?.focus();
    }
  };

  /** 포커스를 벗어나면 한 자리 입력은 0 을 붙여 보정 (9 → 09) */
  const padOnBlur = (key: "mo" | "d") => {
    const cur = parts[key];
    if (cur.length === 1) {
      const n = Math.max(1, Number(cur));
      update({ [key]: String(n).padStart(2, "0") } as Partial<{ mo: string; d: string }>);
    }
  };

  const box = `${crmInputClass} text-center tabular-nums`;

  return (
    <div className="flex items-center gap-1.5">
      <input
        ref={yRef}
        type="text"
        inputMode="numeric"
        pattern="\d*"
        maxLength={4}
        autoFocus={autoFocus}
        disabled={disabled}
        value={parts.y}
        onChange={(e) => onYear(e.target.value)}
        onFocus={(e) => e.target.select()}
        placeholder="YYYY"
        aria-label="생년월일 년"
        className={`${box} w-[84px]`}
      />
      <span className="text-[13px] text-[#A89B80] dark:text-zinc-500">년</span>
      <input
        ref={moRef}
        type="text"
        inputMode="numeric"
        pattern="\d*"
        maxLength={2}
        disabled={disabled}
        value={parts.mo}
        onChange={(e) => onMonth(e.target.value)}
        onKeyDown={(e) => backspaceTo(e, parts.mo, yRef)}
        onBlur={() => padOnBlur("mo")}
        onFocus={(e) => e.target.select()}
        placeholder="MM"
        aria-label="생년월일 월"
        className={`${box} w-[60px]`}
      />
      <span className="text-[13px] text-[#A89B80] dark:text-zinc-500">월</span>
      <input
        ref={dRef}
        type="text"
        inputMode="numeric"
        pattern="\d*"
        maxLength={2}
        disabled={disabled}
        value={parts.d}
        onChange={(e) => onDay(e.target.value)}
        onKeyDown={(e) => backspaceTo(e, parts.d, moRef)}
        onBlur={() => padOnBlur("d")}
        onFocus={(e) => e.target.select()}
        placeholder="DD"
        aria-label="생년월일 일"
        className={`${box} w-[60px]`}
      />
      <span className="text-[13px] text-[#A89B80] dark:text-zinc-500">일</span>
    </div>
  );
}
