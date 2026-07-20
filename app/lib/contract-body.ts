/**
 * 계약서 섹션 본문 렌더용 HTML 변환.
 * - 이미 HTML(태그 포함)이면 그대로 반환 (리치 에디터 산출물)
 * - 평문이면 이스케이프 + 문단/줄바꿈을 <p>/<br> 로 (기존 평문 계약서 하위호환)
 */
export function contractBodyHtml(body: string | null | undefined): string {
  if (!body) return "";
  if (/<[a-z][\s\S]*>/i.test(body)) return body;
  const esc = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("");
}
