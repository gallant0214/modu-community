import { fetchTradePage } from "@/app/lib/trade-query";
import { TradeView } from "./trade-view";

// ISR: 60초 + /api/trade POST 시 invalidateCache 로 즉시 갱신
export const revalidate = 60;

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function TradePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] || "" : v || "");

  const cat = first(params.category);
  const category: "all" | "equipment" | "center" =
    cat === "equipment" || cat === "center" ? cat : "all";

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
