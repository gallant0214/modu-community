export default function CategoryLoading() {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl">
        <div className="px-4 pt-4 pb-3 space-y-2">
          <div className="h-6 w-24 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
          <div className="h-10 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
        </div>
        <div className="border-t border-zinc-100 dark:border-zinc-800" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
            <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse mb-2" style={{ width: `${50 + i * 6}%` }} />
            <div className="flex gap-3">
              <div className="h-3 w-12 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
              <div className="h-3 w-16 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
              <div className="h-3 w-10 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
