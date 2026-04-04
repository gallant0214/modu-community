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
    const decoded = await getAuth(admin).verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}
