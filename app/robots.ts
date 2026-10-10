import type { MetadataRoute } from "next";

/**
 * Google·네이버 등 검색엔진 크롤러 안내.
 *
 * 공개 공유 가치가 있는 콘텐츠(홈·공부자료·실기구술·커뮤니티·구인·거래·마켓)만 허용.
 * 로그인 벽·관리자·개인 데이터·센터 전용·결제 전용 경로는 차단해서
 *  - Google AdSense 심사의 '빈 페이지' 평가 방지
 *  - 사용자 개인 데이터·결제 플로우 노출 방지
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: [
          "/api/",
          "/admin",
          "/developer",
          "/crm",
          "/pay/",
          "/billing",
          "/pricing",
          "/shop/",
          "/join/",
          "/touch/",
          "/my",
          "/member/",
          "/contract/",
          "/keywords",
          "/delete-account",
          "/child-safety",
          "/inquiry",
        ],
      },
    ],
    sitemap: "https://moducm.com/sitemap.xml",
    host: "https://moducm.com",
  };
}
