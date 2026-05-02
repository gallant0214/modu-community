import DOMPurify from "isomorphic-dompurify";

/**
 * 게시글 본문용 sanitize.
 * 사용자가 작성하는 plain text + 자동 변환 <br> 만 허용.
 * (script, on*, iframe, style 등 모두 strip)
 */
export function sanitizePostBody(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["br", "p", "b", "i", "u", "strong", "em", "a"],
    ALLOWED_ATTR: ["href", "target", "rel"],
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true,
  });
}

/**
 * 관리자 TipTap 에디터 출력용 sanitize.
 * 색상/폰트/리스트/표/하이라이트 등 풍부한 포맷팅 허용하되, script/on* 등 제거.
 */
export function sanitizeRichContent(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "h1", "h2", "h3", "h4", "h5", "h6",
      "strong", "b", "em", "i", "u", "s", "strike",
      "ul", "ol", "li",
      "blockquote", "code", "pre",
      "a", "img",
      "span", "div",
      "table", "thead", "tbody", "tr", "th", "td",
      "mark", "hr",
    ],
    ALLOWED_ATTR: [
      "href", "target", "rel",
      "src", "alt", "width", "height",
      "style", "class",
      "colspan", "rowspan",
      "data-color",
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true,
    ADD_ATTR: ["target"],
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input"],
    FORBID_ATTR: [
      "onerror", "onclick", "onload", "onmouseover", "onfocus", "onblur",
      "onsubmit", "onchange", "onkeydown", "onkeyup", "onkeypress",
      "onmouseenter", "onmouseleave", "ondblclick", "ondragstart",
    ],
  });
}
