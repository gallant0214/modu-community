export default function PostDetailLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-[#F8F4EC] dark:bg-zinc-950">
      <div className="mx-auto w-full max-w-lg md:max-w-3xl lg:max-w-4xl px-4 sm:px-6 py-4 sm:py-6 gap-4 flex flex-col">
        {/* 뒤로가기 바 */}
        <div className="h-5 w-24 bg-[#F5F0E5] dark:bg-zinc-800 rounded-lg animate-pulse" />
        {/* 히어로 카드 */}
        <div className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-6 sm:p-8 space-y-4">
          <div className="flex gap-2">
            <div className="h-5 w-14 bg-[#F5F0E5] dark:bg-zinc-800 rounded-full animate-pulse" />
            <div className="h-5 w-10 bg-[#F5F0E5] dark:bg-zinc-800 rounded-full animate-pulse" />
          </div>
          <div className="space-y-2">
            <div className="h-7 w-3/4 bg-[#F5F0E5] dark:bg-zinc-800 rounded-lg animate-pulse" />
            <div className="h-4 w-48 bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse" />
          </div>
        </div>
        {/* 본문 */}
        <div className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-6 sm:p-8 space-y-3">
          {[100, 95, 80, 90, 60, 85, 40].map((w, i) => (
            <div key={i} className="h-4 bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse" style={{ width: `${w}%` }} />
          ))}
        </div>
        {/* 댓글 */}
        <div className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="h-5 w-24 bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2 py-3 border-t border-[#E8E0D0]/50 dark:border-zinc-800 first:border-0">
              <div className="h-3 w-20 bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse" />
              <div className="h-4 bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse" style={{ width: `${50 + i * 15}%` }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
