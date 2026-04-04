"use client";

import { useParams, useRouter } from "next/navigation";
import { exercises } from "@/app/lib/data/practical";

export default function ExerciseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const exercise = exercises.find((e) => e.id === id);

  if (!exercise) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-zinc-400">
        <p className="text-sm">운동 정보를 찾을 수 없습니다.</p>
        <button onClick={() => router.back()} className="mt-3 text-blue-600 text-sm font-semibold">뒤로가기</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl">
        {/* 상단 바 */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-100 dark:border-zinc-800">
          <button onClick={() => router.back()} className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex-1 truncate">{exercise.name}</span>
          <span className="text-xs px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded">{exercise.category}</span>
        </div>

        {/* 이미지 */}
        <div className="w-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center" style={{ minHeight: 220 }}>
          {exercise.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={exercise.image} alt={exercise.name} className="w-full max-h-80 object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-2 py-12 text-zinc-400">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              <span className="text-sm">이미지 준비중</span>
            </div>
          )}
        </div>

        {/* 체크리스트 */}
        <div className="px-4 pt-5 pb-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">채점 체크리스트</span>
            <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
            {exercise.checklist && <span className="text-xs text-zinc-400">{exercise.checklist.length}항목</span>}
          </div>

          {exercise.checklist && exercise.checklist.length > 0 ? (
            <div className="flex flex-col gap-2">
              {exercise.checklist.map((item, idx) => (
                <div key={idx}
                  className="flex items-start gap-3 bg-white dark:bg-zinc-900 rounded-xl px-4 py-3.5 border border-zinc-100 dark:border-zinc-800">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-blue-50 dark:bg-blue-950 flex items-center justify-center text-[11px] font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                    {idx + 1}
                  </span>
                  <p className="text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed">{item}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-400 text-center py-6">체크리스트 준비중입니다.</p>
          )}
        </div>
      </div>
    </div>
  );
}
