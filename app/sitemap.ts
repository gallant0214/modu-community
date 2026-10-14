import type { MetadataRoute } from "next";
import { communityVisible } from "@/app/lib/community-visibility";

/**
 * Google·네이버에 노출할 공개 콘텐츠만 정리.
 * 로그인 벽·개인 데이터(/my), 폼 전용(/inquiry) 은 robots 로 차단되어 있어 제외.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://moducm.com", lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: "https://moducm.com/practical", lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
    { url: "https://moducm.com/study", lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
    /* 🚨 PG 심사 동안 사이트맵에서 뺀다 — 메뉴를 가려도 사이트맵에 남아 있으면
       크롤러와 심사원이 바로 찾는다. 심사 후 NEXT_PUBLIC_HIDE_COMMUNITY 를 지우면 돌아온다. */
    ...(communityVisible()
      ? [{ url: "https://moducm.com/community", lastModified: new Date(), changeFrequency: "daily" as const, priority: 0.9 }]
      : []),
    { url: "https://moducm.com/jobs", lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    { url: "https://moducm.com/trade", lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    { url: "https://moducm.com/market", lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
  ];
}
