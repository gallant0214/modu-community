import type { MetadataRoute } from "next";

/**
 * Google·네이버에 노출할 공개 콘텐츠만 정리.
 * 로그인 벽·개인 데이터(/my), 폼 전용(/inquiry) 은 robots 로 차단되어 있어 제외.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://moducm.com", lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: "https://moducm.com/practical", lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
    { url: "https://moducm.com/study", lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
    { url: "https://moducm.com/community", lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: "https://moducm.com/jobs", lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    { url: "https://moducm.com/trade", lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    { url: "https://moducm.com/market", lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
  ];
}
