"use client";

import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider, browserLocalPersistence, setPersistence, signInWithCredential } from "firebase/auth";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAzISJaLg6SxDzdv8qZBwQqpC4LMe_xq2k",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "auth.moducm.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "moducm-f2edf",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "moducm-f2edf.firebasestorage.app",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:480587636282:web:88c199672ca11e88d81f03",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// App Check (reCAPTCHA v3) - 웹 앱 보호
if (typeof window !== "undefined") {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider("6LcxUqwsAAAAAMLLwgbm4MOj67QUWjGgVdnXRLdy"),
      isTokenAutoRefreshEnabled: true,
    });
  } catch {}
}

const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("email");
googleProvider.addScope("profile");

// browserLocalPersistence 사용 (IndexedDB가 일부 환경에서 문제 발생)
setPersistence(auth, browserLocalPersistence).catch(() => {});

export { auth, googleProvider, signInWithCredential, GoogleAuthProvider };
