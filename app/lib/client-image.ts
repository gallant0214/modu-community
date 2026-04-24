/**
 * 브라우저에서 이미지 파일을 Canvas로 리사이즈 + JPEG 재압축.
 *
 * 목적:
 *  1) Vercel Serverless Function 의 4.5MB body 한도 회피
 *     (고화질 폰 사진 6~15MB → 업로드 직전 브라우저에서 300~600KB로 축소)
 *  2) 업로드 시간 단축 (네트워크 업로드 = 속도 체감 1위 요인)
 *
 * 설계 원칙:
 *  - 이미 충분히 작은 이미지는 그대로 반환 (불필요한 재인코딩 방지)
 *  - maxWidth/maxHeight 안에서 비율 유지
 *  - JPEG 출력 (WebP/AVIF 는 Safari 구버전 호환 이슈 있음)
 *  - 리사이즈 실패 시 원본 그대로 반환 (graceful fallback)
 */
export async function resizeImageFile(
  file: File,
  options: {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    /** 이 크기 이하면서 maxWidth/Height 내면 리사이즈 스킵 */
    skipIfUnder?: number;
  } = {}
): Promise<File> {
  const {
    maxWidth = 1600,
    maxHeight = 1600,
    quality = 0.85,
    skipIfUnder = 400 * 1024, // 400KB
  } = options;

  // 이미지 타입 아니면 그대로 (혹시 다른 파일 섞여도 통과)
  if (!file.type.startsWith("image/")) return file;

  let img: HTMLImageElement | null = null;
  try {
    img = await loadImage(file);
  } catch {
    // 로드 자체가 실패하면 원본 반환 (HEIC 등 브라우저 미지원 포맷)
    return file;
  }

  const { naturalWidth: width, naturalHeight: height } = img;

  // 축소 비율 계산 (확대는 안 함)
  const scale = Math.min(1, maxWidth / width, maxHeight / height);

  // 이미 리사이즈 필요 없고 용량도 작으면 원본 유지
  if (scale >= 1 && file.size < skipIfUnder) {
    return file;
  }

  const newWidth = Math.round(width * scale);
  const newHeight = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = newWidth;
  canvas.height = newHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  ctx.drawImage(img, 0, 0, newWidth, newHeight);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
  });

  if (!blob) return file;

  // 재압축 결과가 원본보다 크면 원본 사용 (이미 잘 압축된 경우)
  if (blob.size >= file.size) return file;

  const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], newName, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image load failed"));
    };
    img.src = url;
  });
}

/**
 * XMLHttpRequest 기반 업로드. fetch 는 업로드 진행률 이벤트가 없어
 * 큰 파일 올릴 때 사용자에게 진행 피드백을 줄 수 없음.
 */
export interface UploadOptions {
  token: string;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

export function uploadWithProgress<T = any>(
  url: string,
  formData: FormData,
  { token, onProgress, signal }: UploadOptions
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      let body: any = {};
      try { body = JSON.parse(xhr.responseText || "{}"); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as T);
      } else {
        const err = new Error(body?.error || `HTTP ${xhr.status}`);
        (err as any).status = xhr.status;
        (err as any).body = body;
        reject(err);
      }
    };
    xhr.onerror = () => reject(new Error("네트워크 오류"));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));

    if (signal) {
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    xhr.send(formData);
  });
}
