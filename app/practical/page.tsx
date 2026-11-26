import { pageMeta } from "@/app/lib/seo";
import { PracticalView } from "./practical-view";

export const metadata = pageMeta({
  title: "체육지도사 실기·구술 — 종목별 평가 항목과 기출 질문",
  description:
    "생활스포츠지도사·건강운동관리사 실기 평가 동작 체크리스트와 종목별 구술 기출 질문을 한곳에 정리했어요. 북마크로 시험 전 빠르게 복습하세요.",
  path: "/practical",
});

export default function PracticalPage() {
  return <PracticalView />;
}
