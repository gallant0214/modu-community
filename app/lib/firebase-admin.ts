import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

let app: App;

function getFirebaseAdmin() {
  if (getApps().length === 0) {
    // 서비스 계정 JSON이 환경변수에 있으면 사용, 없으면 projectId만으로 초기화
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccount) {
      app = initializeApp({
        credential: cert(JSON.parse(serviceAccount)),
      });
    } else {
      app = initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || "moducm-f2edf",
      });
    }
  } else {
    app = getApps()[0];
  }
  return app;
}

/**
 * Firebase ID Token 검증
 * @returns 검증된 사용자 UID (실패 시 null)
 */
/**
 * 관리자 UID 확인
 * 환경변수 ADMIN_UIDS에 콤마로 구분하여 등록 (예: "uid1,uid2")
 */
export function isAdminUid(uid: string): boolean {
  const adminUids = process.env.ADMIN_UIDS || "";
  if (!adminUids) return false;
  return adminUids.split(",").map(u => u.trim()).includes(uid);
}

export async function verifyAuth(
  request: Request
): Promise<{ uid: string; email?: string } | null> {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return null;
    }
    const token = authHeader.substring(7);
    const admin = getFirebaseAdmin();
    // checkRevoked=true: 로그아웃/계정 비활성화된 토큰을 즉시 거부
    const decoded = await getAuth(admin).verifyIdToken(token, true);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}

/**
 * 순수 토큰 문자열로 검증 (server action에서 client가 argument로 전달한 토큰 검증용)
 * verifyAuth와 달리 Request 객체를 받지 않음
 */
export async function verifyIdTokenString(
  idToken: string | null | undefined,
): Promise<{ uid: string; email?: string } | null> {
  try {
    if (!idToken || typeof idToken !== "string") return null;
    const admin = getFirebaseAdmin();
    const decoded = await getAuth(admin).verifyIdToken(idToken, true);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}
