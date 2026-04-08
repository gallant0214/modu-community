export default function CategoryLoading() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-lg md:max-w-3xl lg:max-w-5xl">
        {/* 헤더 스켈레톤 */}
        <header className="flex items-center justify-between bg-white px-4 py-3 md:px-6 md:py-4 dark:bg-zinc-900">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
            <div className="h-5 w-24 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
            <div className="h-8 w-16 rounded-full bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
          </div>
        </header>

        {/* 탭 스켈레톤 */}
        <div className="flex border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex-1 py-3 flex justify-center"><div className="h-4 w-12 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" /></div>
          <div className="flex-1 py-3 flex justify-center"><div className="h-4 w-12 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" /></div>
          <div className="flex-1 py-3 flex justify-center"><div className="h-4 w-12 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" /></div>
        </div>

        {/* 게시글 스켈레톤 */}
        <div className="bg-white dark:bg-zinc-900">
          {[70, 55, 80, 45, 65, 50].map((w, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-4 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex-1 space-y-2">
                <div className="h-4 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" style={{ width: `${w}%` }} />
                <div className="flex gap-2">
                  <div className="h-3 w-12 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
                  <div className="h-3 w-16 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
                  <div className="h-3 w-10 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
