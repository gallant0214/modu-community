"use client";

import { useState, useEffect } from "react";

export default function SplashScreen() {
  const [visible, setVisible] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
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
  }, []);

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
