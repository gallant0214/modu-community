import sanitizeHtml from "sanitize-html";

/**
 * 게시글 본문용 sanitize.
 * 사용자가 작성하는 plain text + 자동 변환 <br> 만 허용.
 * (script, on*, iframe, style 등 모두 strip)
 *
 * 2026-05-22: isomorphic-dompurify → sanitize-html 로 교체.
 * Vercel serverless 에서 jsdom→@exodus/bytes ESM require 오류로 공지 상세 페이지 SSR
 * 모듈 로드 자체가 실패 (ERR_REQUIRE_ESM).
 */
export function sanitizePostBody(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["br", "p", "b", "i", "u", "strong", "em", "a"],
    allowedAttributes: {
      a: ["href", "target", "rel"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
  });
}

/**
 * 관리자 TipTap 에디터 출력용 sanitize.
 * 색상/폰트/리스트/표/하이라이트 등 풍부한 포맷팅 허용하되, script/on* 등 제거.
 */
export function sanitizeRichContent(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "h1", "h2", "h3", "h4", "h5", "h6",
      "strong", "b", "em", "i", "u", "s", "strike",
      "ul", "ol", "li",
      "blockquote", "code", "pre",
      "a", "img",
      "span", "div",
      "table", "thead", "tbody", "tr", "th", "td",
      "mark", "hr",
    ],
    allowedAttributes: {
      "*": ["style", "class", "data-color"],
      a: ["href", "target", "rel"],
      img: ["src", "alt", "width", "height"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: {
      img: ["http", "https", "data"],
    },
    // TipTap 색상/하이라이트/정렬 등 인라인 스타일 화이트리스트
    allowedStyles: {
      "*": {
        color: [/^.*$/],
        "background-color": [/^.*$/],
        "text-align": [/^(left|right|center|justify)$/],
        "font-weight": [/^.*$/],
        "font-style": [/^.*$/],
        "text-decoration": [/^.*$/],
      },
    },
    disallowedTagsMode: "discard",
  });
}
