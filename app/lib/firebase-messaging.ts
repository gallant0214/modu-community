"use client";

import { getApps, initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage, isSupported, type Messaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAzISJaLg6SxDzdv8qZBwQqpC4LMe_xq2k",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "auth.moducm.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "moducm-f2edf",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "moducm-f2edf.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "480587636282",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:480587636282:web:88c199672ca11e88d81f03",
};

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || "";

let _messaging: Messaging | null = null;

async function getMessagingClient(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;
  const supported = await isSupported().catch(() => false);
  if (!supported) return null;

  if (_messaging) return _messaging;
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  _messaging = getMessaging(app);
  return _messaging;
}

/**
 * Service Worker 등록 + 알림 권한 요청 + FCM 토큰 발급
 * @returns 발급된 토큰 (실패/거부 시 null)
 */
export async function requestWebPushToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return null;
  if (!VAPID_KEY) return null;

  // 권한 요청
  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return null;

  const messaging = await getMessagingClient();
  if (!messaging) return null;

  // SW 등록 — 이미 등록돼있으면 재사용
  let registration: ServiceWorkerRegistration | undefined;
  try {
    registration = await navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js");
    if (!registration) {
      registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    }
  } catch (e) {
    console.warn("[web-push] SW register failed", e);
    return null;
  }

  try {
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    return token || null;
  } catch (e) {
    console.warn("[web-push] getToken failed", e);
    return null;
  }
}

/**
 * Foreground 메시지 수신 콜백 등록.
 * 브라우저 탭이 활성/포커스 상태일 때 — 시스템 알림은 안 뜨고 이 콜백이 호출됨.
 * 호출자가 in-app toast 등으로 알림 처리.
 */
export async function onForegroundWebPush(
  callback: (payload: {
    title: string;
    body: string;
    data: Record<string, string>;
  }) => void,
): Promise<() => void> {
  const messaging = await getMessagingClient();
  if (!messaging) return () => {};

  const unsubscribe = onMessage(messaging, (payload) => {
    callback({
      title: payload?.notification?.title || (payload?.data?.title as string) || "",
      body: payload?.notification?.body || (payload?.data?.body as string) || "",
      data: (payload?.data as Record<string, string>) || {},
    });
  });
  return unsubscribe;
}
