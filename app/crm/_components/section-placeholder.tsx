interface Props {
  title: string;
  subtitle?: string;
  ready?: boolean;
}

/**
 * Commit B 단계의 빈 페이지 셸.
 * 후속 커밋에서 각 페이지가 실제 기능으로 대체됨.
 */
export function SectionPlaceholder({ title, subtitle, ready = false }: Props) {
  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">{subtitle}</p>
        )}
      </header>

      <div className="border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-2xl px-5 py-12 text-center bg-[#FBF7EB]/40 dark:bg-zinc-900/40">
        <div className="text-[14px] font-medium text-[#6B5D47] dark:text-zinc-300">
          {ready ? "곧 표시됩니다" : "준비 중입니다"}
        </div>
        <div className="mt-2 text-[12.5px] text-[#A89B80] dark:text-zinc-500">
          이 화면은 다음 단계 작업에서 실제 데이터로 채워집니다.
        </div>
      </div>
    </div>
  );
}
