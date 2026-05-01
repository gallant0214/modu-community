// Firebase Cloud Messaging — Service Worker
// 브라우저 탭이 닫혀있을 때(또는 background 일 때) 푸시 알림을 받아 OS 시스템 알림으로 표시.
// 같은 도메인 루트에 위치해야 함 (/firebase-messaging-sw.js).
// 브라우저가 SW 코드를 캐시하므로, Firebase 설정 바뀌면 SW 버전(아래 SW_VERSION) 도 업데이트할 것.

self.SW_VERSION = "1";

importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAzISJaLg6SxDzdv8qZBwQqpC4LMe_xq2k",
  authDomain: "auth.moducm.com",
  projectId: "moducm-f2edf",
  storageBucket: "moducm-f2edf.firebasestorage.app",
  messagingSenderId: "480587636282",
  appId: "1:480587636282:web:88c199672ca11e88d81f03",
});

const messaging = firebase.messaging();

// Background message — 시스템 알림으로 표시
messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || payload?.data?.title || "모두의 지도사";
  const options = {
    body: payload?.notification?.body || payload?.data?.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload?.data?.messageId || payload?.collapse_key || "moducm",
    data: payload?.data || {},
  };
  self.registration.showNotification(title, options);
});

// 알림 클릭 → 해당 페이지로 이동 (또는 모듀 탭 활성화)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const baseUrl = self.location.origin;

  let url = "/";
  if (data.type === "message" && data.messageId) {
    url = `/my?tab=receivedMessages&open=${data.messageId}`;
  } else if (data.postId && data.commentId) {
    url = `/category/${data.categoryId || 0}/post/${data.postId}?hc=${data.commentId}`;
  } else if (data.postId) {
    url = `/category/${data.categoryId || 0}/post/${data.postId}`;
  } else if (data.targetType === "job" && data.targetId) {
    url = `/jobs/${data.targetId}`;
  } else if (data.type === "admin_broadcast" || data.type === "notice" || data.type === "ad" || data.type === "event") {
    url = "/my?tab=notifications";
  }

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // 이미 열린 모듀 탭이 있으면 거기로 포커스 + URL 이동
      for (const c of clientList) {
        if (c.url.startsWith(baseUrl)) {
          c.focus();
          if ("navigate" in c) return c.navigate(url);
          return;
        }
      }
      // 열린 탭 없으면 새 탭
      return clients.openWindow(baseUrl + url);
    }),
  );
});
