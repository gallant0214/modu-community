import { exercises } from "@/app/lib/data/practical";
import { pageMeta } from "@/app/lib/seo";
import { ExerciseView } from "./exercise-view";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const ex = exercises.find((e) => e.id === Number(id));
  if (!ex) return { title: "운동 정보를 찾을 수 없습니다", robots: { index: false } };
  const points = (ex.checklist ?? []).slice(0, 3).join(" ");
  return pageMeta({
    title: `${ex.name} — 실기 평가 체크리스트 (${ex.category})`,
    description: points
      ? `체육지도사 실기 ${ex.name} 평가 포인트: ${points}`
      : `체육지도사 실기 평가 동작 ${ex.name}(${ex.category}) 자세와 체크 포인트.`,
    path: `/practical/exercise/${ex.id}`,
    type: "article",
  });
}

export default function ExerciseDetailPage() {
  return <ExerciseView />;
}
