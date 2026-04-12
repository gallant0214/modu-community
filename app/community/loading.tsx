export default function CommunityLoading() {
  return (
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl">
        <div className="px-4 pt-4 pb-2">
          <div className="h-8 w-40 bg-[#F5F0E5] dark:bg-zinc-800 rounded-lg animate-pulse mb-2" />
          <div className="h-4 w-56 bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse" />
        </div>
        <div className="px-4 py-3 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
              <div className="w-10 h-10 bg-[#F5F0E5] dark:bg-zinc-800 rounded-lg animate-pulse shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse" style={{ width: `${40 + i * 5}%` }} />
                <div className="h-3 w-16 bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
