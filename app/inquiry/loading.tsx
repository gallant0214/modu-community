export default function InquiryLoading() {
  return (
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-4 sm:py-6 space-y-4">
        <div className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-6 space-y-3">
          <div className="h-6 w-32 bg-[#F5F0E5] dark:bg-zinc-800 rounded-lg animate-pulse" />
          <div className="h-4 w-56 bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse" />
        </div>
        <div className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl overflow-hidden">
          <div className="px-5 py-2.5 border-b border-[#E8E0D0]/60 dark:border-zinc-800">
            <div className="h-3 w-full bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse" />
          </div>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center px-5 py-3 border-b border-[#E8E0D0]/50 dark:border-zinc-800 last:border-0 gap-3">
              <div className="h-4 flex-1 bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse" style={{ maxWidth: `${40 + i * 12}%` }} />
              <div className="h-3 w-12 bg-[#F5F0E5] dark:bg-zinc-800 rounded animate-pulse shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
