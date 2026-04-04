export default function JobsLoading() {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl">
        <div className="px-4 pt-4 pb-3">
          <div className="h-8 w-32 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse mb-3" />
          <div className="h-10 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse mb-2" />
          <div className="h-8 w-48 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
        </div>
        <div className="border-t border-zinc-100 dark:border-zinc-800" />
        <div className="flex items-center px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-700">
          <div className="flex-1 h-4 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex-1 space-y-2">
              <div className="h-3 w-12 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
              <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" style={{ width: `${60 + Math.random() * 30}%` }} />
            </div>
            <div className="h-3 w-12 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
            <div className="h-3 w-16 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
            <div className="h-3 w-8 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
            <div className="h-3 w-8 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
