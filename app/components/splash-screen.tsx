"use client";

import { useState, useEffect } from "react";

export default function SplashScreen() {
  // 앱 내 WebView에서 접근 시 스플래시 스킵 (?nosplash=1)
  const skipSplash = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("nosplash");

  const [visible, setVisible] = useState(!skipSplash);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (skipSplash) return;

    const timer = setTimeout(() => {
      setFadeOut(true);
    }, 1000);

    const removeTimer = setTimeout(() => {
      setVisible(false);
    }, 1300);

    return () => {
      clearTimeout(timer);
      clearTimeout(removeTimer);
    };
  }, [skipSplash]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-300"
      style={{
        backgroundColor: "#f5f0e8",
        opacity: fadeOut ? 0 : 1,
      }}
    >
      <img
        src="/splash.png"
        alt="모두의 지도사"
        className="h-full w-full object-cover"
      />
    </div>
  );
}
