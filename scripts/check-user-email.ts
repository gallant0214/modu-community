import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

if (getApps().length === 0) {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) { console.error("NO FIREBASE_SERVICE_ACCOUNT"); process.exit(1); }
  initializeApp({ credential: cert(JSON.parse(sa)) });
}

async function main() {
  const uid = "pap6tOjxl0ZTwT7HQUvJzrCBE8D3";
  try {
    const u = await getAuth().getUser(uid);
    console.log(JSON.stringify({
      uid: u.uid,
      email: u.email || "(없음)",
      emailVerified: u.emailVerified,
      providers: (u.providerData || []).map(p => ({ providerId: p.providerId, email: p.email || "(없음)", uid: p.uid })),
      createdAt: u.metadata?.creationTime,
      lastSignInAt: u.metadata?.lastSignInTime,
      disabled: u.disabled,
    }, null, 2));
  } catch (e: any) { console.error("ERR:", e.code || e.message); }
}
main();
