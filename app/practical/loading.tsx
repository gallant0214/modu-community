export default function PracticalLoading() {
  return (
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl px-4 pt-4">
        {/* 히어로 */}
        <div className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-6 mb-4 space-y-3">
          <div className="h-5 w-40 bg-[#F5F0E5] dark:bg-zinc-800 rounded-full animate-pulse" />
          <div className="h-7 w-3/4 bg-[#F5F0E5] dark:bg-zinc-800 rounded-lg animate-pulse" />
          <div className="h-4 w-full bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse" />
        </div>
        {/* 탭 */}
        <div className="h-12 bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl mb-4 animate-pulse" />
        {/* 종목 리스트 */}
        <div className="space-y-3 px-0 py-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl px-4 py-4">
              <div className="w-11 h-11 bg-[#F5F0E5] dark:bg-zinc-800 rounded-2xl animate-pulse shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-24 bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse" />
                <div className="h-3 w-16 bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
