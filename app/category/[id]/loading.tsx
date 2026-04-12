export default function CategoryLoading() {
  return (
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950">
      <div className="mx-auto max-w-lg md:max-w-3xl lg:max-w-5xl">
        {/* 히어로 스켈레톤 */}
        <div className="px-4 sm:px-6 pt-4">
          <div className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-6 space-y-3">
            <div className="h-5 w-32 bg-[#F5F0E5] dark:bg-zinc-800 rounded-full animate-pulse" />
            <div className="h-7 w-2/3 bg-[#F5F0E5] dark:bg-zinc-800 rounded-lg animate-pulse" />
            <div className="h-4 w-full bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse" />
          </div>
        </div>
        {/* 탭 + 검색 */}
        <div className="px-4 sm:px-6 py-3 flex gap-2">
          <div className="h-10 flex-1 bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-xl animate-pulse" />
          <div className="h-10 w-10 bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-xl animate-pulse" />
        </div>
        {/* 게시글 리스트 */}
        <div className="px-4 sm:px-6">
          <div className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl overflow-hidden">
            {[70, 55, 80, 45, 65, 50].map((w, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-[#E8E0D0]/50 dark:border-zinc-800 last:border-0">
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse" style={{ width: `${w}%` }} />
                  <div className="flex gap-2">
                    <div className="h-3 w-12 bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse" />
                    <div className="h-3 w-16 bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
