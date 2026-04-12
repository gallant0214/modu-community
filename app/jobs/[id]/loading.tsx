export default function JobDetailLoading() {
  return (
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl lg:max-w-4xl px-4 sm:px-6 py-4 sm:py-6 space-y-4">
        <div className="h-5 w-24 bg-[#F5F0E5] dark:bg-zinc-800 rounded-lg animate-pulse" />
        <div className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-6 sm:p-8 space-y-4">
          <div className="flex gap-2">
            <div className="h-6 w-16 bg-[#F5F0E5] dark:bg-zinc-800 rounded-full animate-pulse" />
            <div className="h-6 w-20 bg-[#F5F0E5] dark:bg-zinc-800 rounded-full animate-pulse" />
          </div>
          <div className="h-8 w-2/3 bg-[#F5F0E5] dark:bg-zinc-800 rounded-lg animate-pulse" />
          <div className="h-4 w-40 bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse" />
        </div>
        <div className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-6 sm:p-8 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <div className="h-4 w-20 bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse shrink-0" />
              <div className="h-4 flex-1 bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
