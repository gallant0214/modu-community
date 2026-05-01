"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { requestWebPushToken, onForegroundWebPush } from "@/app/lib/firebase-messaging";
import { WebPushToast, type WebPushToastData } from "@/app/components/web-push-toast";

/**
 * Web Push 초기화:
 * - 로그인 시 알림 권한 요청 + FCM 토큰 발급 + 서버 등록 (platform="web")
 * - Foreground 푸시 수신 → in-app toast 표시 (탭 시 해당 콘텐츠 이동)
 * - Background 는 SW(/firebase-messaging-sw.js) 가 OS 알림으로 처리
 */
export function WebPushInitializer() {
  const { user, getIdToken } = useAuth();
  const registered = useRef(false);
  const [toast, setToast] = useState<WebPushToastData | null>(null);

  // 토큰 발급 + 서버 등록 (한 번만)
  useEffect(() => {
    if (!user || registered.current) return;
    registered.current = true;
    (async () => {
      try {
        const pushToken = await requestWebPushToken();
        if (!pushToken) return; // 권한 거부/미지원
        const authToken = await getIdToken();
        if (!authToken) return;
        await fetch("/api/notifications/token", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ token: pushToken, platform: "web" }),
        });
      } catch {}
    })();
  }, [user, getIdToken]);

  // Foreground 메시지 수신 → toast
  const buildHref = useCallback((data: Record<string, string>): string => {
    if (data?.type === "message" && data?.messageId) return "/my?tab=receivedMessages";
    if (data?.postId && data?.commentId) return `/category/${data.categoryId || 0}/post/${data.postId}?hc=${data.commentId}`;
    if (data?.postId) return `/category/${data.categoryId || 0}/post/${data.postId}`;
    if (data?.targetType === "job" && data?.targetId) return `/jobs/${data.targetId}`;
    return "/my?tab=notifications";
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    onForegroundWebPush((payload) => {
      setToast({
        title: payload.title,
        body: payload.body,
        href: buildHref(payload.data),
      });
    }).then((u) => {
      unsubscribe = u;
    });
    return () => {
      unsubscribe?.();
    };
  }, [buildHref]);

  return <WebPushToast toast={toast} onDismiss={() => setToast(null)} />;
}
