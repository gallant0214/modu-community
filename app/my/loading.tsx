export default function MyLoading() {
  return (
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
        {/* 프로필 카드 스켈레톤 */}
        <div className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-[#F5F0E5] dark:bg-zinc-800 animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-28 bg-[#F5F0E5] dark:bg-zinc-800 rounded-lg animate-pulse" />
              <div className="h-3 w-40 bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse" />
            </div>
          </div>
          <div className="flex justify-around mt-4 pt-4 border-t border-[#E8E0D0] dark:border-zinc-700">
            {[1, 2, 3].map((i) => (
              <div key={i} className="text-center space-y-1.5">
                <div className="h-5 w-8 mx-auto bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse" />
                <div className="h-3 w-10 mx-auto bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
        {/* 내 활동 카드 스켈레톤 */}
        <div className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E8E0D0] dark:border-zinc-700">
            <div className="h-4 w-16 bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse" />
          </div>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-[#E8E0D0]/50 dark:border-zinc-800 last:border-0">
              <div className="w-5 h-5 bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse" />
              <div className="h-4 flex-1 bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse" style={{ maxWidth: `${50 + i * 8}%` }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
