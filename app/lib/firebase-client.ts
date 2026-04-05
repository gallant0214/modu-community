"use client";

import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider, indexedDBLocalPersistence, browserLocalPersistence, setPersistence } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAzISJaLg6SxDzdv8qZBwQqpC4LMe_xq2k",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "moducm-f2edf.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "moducm-f2edf",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "moducm-f2edf.firebasestorage.app",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// IndexedDB를 우선 사용하되, 실패 시 localStorage로 폴백하여 앱 업데이트 시 세션 유지
setPersistence(auth, indexedDBLocalPersistence).catch(() => {
  setPersistence(auth, browserLocalPersistence).catch(() => {});
});

export { auth, googleProvider };
