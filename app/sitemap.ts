import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://moducm.com", lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: "https://moducm.com/community", lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: "https://moducm.com/jobs", lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: "https://moducm.com/practical", lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: "https://moducm.com/my", lastModified: new Date(), changeFrequency: "weekly", priority: 0.5 },
    { url: "https://moducm.com/inquiry", lastModified: new Date(), changeFrequency: "weekly", priority: 0.4 },
  ];
}
