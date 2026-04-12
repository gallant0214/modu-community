export default function JobsLoading() {
  return (
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl lg:max-w-5xl px-4 sm:px-6 pt-4 space-y-4">
        {/* 히어로 */}
        <div className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-6 space-y-3">
          <div className="h-5 w-28 bg-[#F5F0E5] dark:bg-zinc-800 rounded-full animate-pulse" />
          <div className="h-7 w-2/3 bg-[#F5F0E5] dark:bg-zinc-800 rounded-lg animate-pulse" />
          <div className="h-4 w-full bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse" />
        </div>
        {/* 필터 바 */}
        <div className="flex gap-2">
          <div className="h-10 w-24 bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-xl animate-pulse" />
          <div className="h-10 w-24 bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-xl animate-pulse" />
        </div>
        {/* 구인 카드 */}
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl p-4 space-y-2">
            <div className="flex gap-2">
              <div className="h-5 w-14 bg-[#F5F0E5] dark:bg-zinc-800 rounded-full animate-pulse" />
              <div className="h-5 w-16 bg-[#F5F0E5] dark:bg-zinc-800 rounded-full animate-pulse" />
            </div>
            <div className="h-5 w-3/4 bg-[#F5F0E5] dark:bg-zinc-800 rounded-lg animate-pulse" />
            <div className="h-3 w-40 bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
