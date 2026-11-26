import type { Metadata } from "next";

export const SITE_NAME = "모두의 지도사";
export const SITE_URL = "https://moducm.com";

/**
 * 공개 페이지별 제목·설명·canonical 을 한 번에 만든다.
 * 🚨 하위 페이지가 openGraph/twitter 를 지정하면 레이아웃 값이 통째로 덮어써지므로
 *    siteName·이미지·locale 까지 여기서 다시 채운다.
 * title 은 레이아웃 title.template("%s | 모두의 지도사") 이 붙는다. 템플릿 없이 쓰려면 absoluteTitle.
 */
export function pageMeta(opts: {
  title: string;
  description: string;
  path: string;
  absoluteTitle?: boolean;
  type?: "website" | "article";
  noindex?: boolean;
}): Metadata {
  const description = clip(opts.description, 155);
  const fullTitle = opts.absoluteTitle ? opts.title : `${opts.title} | ${SITE_NAME}`;
  return {
    title: opts.absoluteTitle ? { absolute: opts.title } : opts.title,
    description,
    alternates: { canonical: opts.path },
    openGraph: {
      title: fullTitle,
      description,
      url: opts.path,
      siteName: SITE_NAME,
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: SITE_NAME }],
      locale: "ko_KR",
      type: opts.type ?? "website",
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: ["/og-image.png"],
    },
    ...(opts.noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

/** 본문(HTML·마크다운 섞임)을 검색 설명용 한 줄로 정리 */
export function toPlainExcerpt(raw: string | null | undefined, max = 155): string {
  const text = String(raw ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[#*_>`~]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clip(text, max);
}

function clip(s: string, max: number): string {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}
