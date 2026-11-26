import { fetchJobsPage } from "@/app/lib/jobs-query";
import { JobsView } from "./jobs-view";
import { pageMeta } from "@/app/lib/seo";

// ISR: 60초마다 재검증 (/api/jobs POST/PUT/DELETE 에서 invalidateCache 로 즉시 무효화됨)
export const revalidate = 60;

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ searchParams }: PageProps) {
  const params = await searchParams;
  const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] || "" : v || "");
  const pageNo = Math.max(1, Number(first(params.page)) || 1);
  return pageMeta({
    title: `스포츠 구인 — 헬스·필라테스·체육 강사 채용${pageNo > 1 ? ` (${pageNo}페이지)` : ""}`,
    description:
      "헬스 트레이너, 필라테스·요가 강사, 수영·태권도 등 체육지도사 채용 공고를 지역·종목·고용형태별로 모아봤어요.",
    // 필터·정렬만 다른 주소는 같은 목록으로 본다. 검색어 결과는 색인 제외.
    path: pageNo > 1 ? `/jobs?page=${pageNo}` : "/jobs",
    noindex: Boolean(first(params.q).trim()),
  });
}

/**
 * /jobs Server Component.
 * URL 쿼리 파라미터에 맞춰 초기 데이터를 서버에서 미리 조회하고 클라이언트 뷰에 전달.
 * 이후 필터/페이지 변경은 JobsView 내부에서 /api/jobs 로 클라이언트 재조회.
 */
export default async function JobsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] || "" : v || "");

  let initialData = null;
  try {
    initialData = await fetchJobsPage({
      regionCode: first(params.region_code),
      sort: first(params.sort) || "latest",
      page: Number(first(params.page)) || 1,
      q: first(params.q).trim(),
      searchType: first(params.searchType) || "all",
      employmentType: first(params.employment_type),
      hideClosed: first(params.hide_closed) === "true",
      sportFilter: first(params.sport),
    });
  } catch {
    // DB/Redis 장애 시 SSR 데이터 없이 렌더 → 클라이언트가 자체 fetch 로 폴백
    initialData = null;
  }

  return <JobsView initialData={initialData} />;
}
