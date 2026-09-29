"use client";

/**
 * CRM 목록 공용 페이저 (회원 관리·회원권 관리·수강권 관리).
 * 한 페이지 25개가 기본이고, 현재 페이지 주변 번호만 보여준다
 * (1,487건 = 60페이지처럼 길어질 때 1~7 만 나오면 뒤쪽으로 갈 수 없다).
 */
export function CrmPagination({
  page,
  totalPages,
  onChange,
  total,
  pageSize,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
  /** 전체 건수 — 주면 "26–50 / 총 1,487건" 을 함께 보여준다 */
  total?: number;
  pageSize?: number;
}) {
  const range =
    total != null && pageSize
      ? `${total === 0 ? 0 : (page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} / 총 ${total.toLocaleString()}건`
      : null;

  if (totalPages <= 1) {
    return <div className="text-[12px] text-[#A89B80]">{range ?? "1"}</div>;
  }

  // 현재 페이지를 가운데 두고 최대 7개
  const WINDOW = 7;
  const start = Math.max(1, Math.min(page - Math.floor(WINDOW / 2), totalPages - WINDOW + 1));
  const end = Math.min(totalPages, start + WINDOW - 1);
  const pages: number[] = [];
  for (let i = start; i <= end; i += 1) pages.push(i);

  const btn = "px-2 py-1 rounded text-[12px] text-[#6B5D47] dark:text-zinc-400 disabled:opacity-30";
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {range && <span className="text-[12px] text-[#A89B80] mr-1">{range}</span>}
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(1)} disabled={page <= 1} className={btn} title="첫 페이지">
          «
        </button>
        <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page <= 1} className={btn}>
          ←
        </button>
        {start > 1 && <span className="text-[12px] text-[#A89B80]">…</span>}
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`min-w-[24px] px-1.5 py-0.5 rounded text-[12px] font-medium ${
              page === p
                ? "bg-[#6B7B3A] text-white"
                : "text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5] dark:hover:bg-zinc-900"
            }`}
          >
            {p}
          </button>
        ))}
        {end < totalPages && <span className="text-[12px] text-[#A89B80]">…</span>}
        <button
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className={btn}
        >
          →
        </button>
        <button
          onClick={() => onChange(totalPages)}
          disabled={page >= totalPages}
          className={btn}
          title="마지막 페이지"
        >
          »
        </button>
      </div>
    </div>
  );
}
