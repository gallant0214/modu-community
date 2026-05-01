"use client";

import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider, browserLocalPersistence, setPersistence, signInWithCredential } from "firebase/auth";
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAzISJaLg6SxDzdv8qZBwQqpC4LMe_xq2k",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "auth.moducm.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "moducm-f2edf",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "moducm-f2edf.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "480587636282",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:480587636282:web:88c199672ca11e88d81f03",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("email");
googleProvider.addScope("profile");

// browserLocalPersistence 사용 (IndexedDB가 일부 환경에서 문제 발생)
setPersistence(auth, browserLocalPersistence).catch(() => {});

export { auth, googleProvider, signInWithCredential, GoogleAuthProvider };
