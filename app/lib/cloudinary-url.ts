/**
 * Cloudinary 이미지 URL에 delivery-time 변환 파라미터를 삽입.
 *
 * 업로드 시점엔 WebP/1600px으로 저장하고, 전송 시점엔 이 헬퍼로
 *   - f_auto: AVIF/WebP/JPEG 중 브라우저가 지원하는 최적 포맷 자동 선택
 *   - q_auto: Cloudinary 자동 품질 (보통 80-85% 수준, 시각 차이 거의 없음)
 *   - w_<N>: 실제 표시 사이즈에 맞게 다운스케일 (모바일에서 큰 절약)
 * 을 추가하여 추가 20~40% 절약 가능.
 *
 * 원본 URL 예:
 *   https://res.cloudinary.com/dxxx/image/upload/v12345/moducm/posts/abc.webp
 * 변환 후:
 *   https://res.cloudinary.com/dxxx/image/upload/f_auto,q_auto,w_800/v12345/moducm/posts/abc.webp
 */
export function optimizeCloudinaryUrl(
  url: string | null | undefined,
  options?: { width?: number }
): string {
  if (!url || !url.includes("res.cloudinary.com") || !url.includes("/upload/")) {
    return url || "";
  }

  // 이미 변환 파라미터가 들어있으면 중복 삽입 방지 (/upload/ 뒤 첫 세그먼트가 transform인지 체크)
  // transform 세그먼트는 보통 영문 소문자_숫자,... 형태로 시작 (예: f_auto, w_800, c_fill)
  const parts = url.split("/upload/");
  if (parts.length !== 2) return url;
  const afterUpload = parts[1];
  const firstSegment = afterUpload.split("/")[0];
  if (/^[a-z]_/i.test(firstSegment)) {
    return url; // 이미 변환이 있음
  }

  const transforms = ["f_auto", "q_auto"];
  if (options?.width) transforms.push(`w_${options.width}`);

  return `${parts[0]}/upload/${transforms.join(",")}/${afterUpload}`;
}
