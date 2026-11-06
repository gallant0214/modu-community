/**
 * API 실패 원인 처리 (2026-11-06).
 *
 * 예전엔 실패 응답에 `detail: error.message`(DB 원문)를 싣기만 하고 서버 로그에는 아무것도 안 남겼다.
 * → 원인은 브라우저 개발자도구에서만 보였고, 응답에서 빼면 원인을 알 방법이 사라지는 구조였다.
 *
 *  - errDetail(err)  : 원인을 서버 로그(Vercel)에 남기고, 응답 detail 로 원문을 돌려준다.
 *                      **직원 전용**(CRM·강사앱·관리자) 경로 — 직원 화면에서 바로 원인을 보며 고칠 수 있게.
 *  - errLogOnly(err) : 서버 로그에만 남기고 응답에는 싣지 않는다(undefined → JSON 에서 키가 빠진다).
 *                      **직원이 아닌 사람**이 부르는 경로 — 회원앱(/api/crm/member-app), 키오스크(/api/touch),
 *                      QR 웹가입(/api/crm/join), 계약서 서명 링크(/api/contract/sign). DB 표·칸 이름이 밖으로 새지 않게.
 */
function messageOf(err: unknown): string | undefined {
  if (err == null) return undefined;
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return String(err);
}

export function errDetail(err: unknown): string | undefined {
  const msg = messageOf(err);
  // Vercel 로그에는 요청 경로가 같이 찍힌다. Supabase 에러는 code·details·hint 까지 남는다.
  if (msg !== undefined) console.error("[api-error]", msg, err);
  return msg;
}

export function errLogOnly(err: unknown): undefined {
  errDetail(err);
  return undefined;
}
