import { fetchTradePage } from "@/app/lib/trade-query";
import { TradeView } from "./trade-view";
import { pageMeta } from "@/app/lib/seo";

// ISR: 60초 + /api/trade POST 시 invalidateCache 로 즉시 갱신
export const revalidate = 60;

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ searchParams }: PageProps) {
  const params = await searchParams;
  const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] || "" : v || "");
  const pageNo = Math.max(1, Number(first(params.page)) || 1);
  return pageMeta({
    title: `스포츠 거래 — 운동기구·센터 매매·용품 중고거래${pageNo > 1 ? ` (${pageNo}페이지)` : ""}`,
    description:
      "헬스장 운동기구, 체육시설 양도·매매, 스포츠 용품까지. 체육 현장 사람들끼리 사고파는 스포츠 거래 게시판.",
    path: pageNo > 1 ? `/trade?page=${pageNo}` : "/trade",
    noindex: Boolean(first(params.q).trim()),
  });
}

export default async function TradePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] || "" : v || "");

  const cat = first(params.category);
  const category: "all" | "equipment" | "center" | "gear" =
    cat === "equipment" || cat === "center" || cat === "gear" ? cat : "all";

  let initialData = null;
  try {
    initialData = await fetchTradePage({
      category,
      q: first(params.q),
      sido: first(params.sido),
      sigungu: first(params.sigungu),
      page: Number(first(params.page)) || 1,
      sort: first(params.sort) === "popular" ? "popular" : "latest",
    });
  } catch {
    initialData = null;
  }

  return <TradeView initialData={initialData} initialCategory={category} initialQuery={first(params.q)} />;
}
