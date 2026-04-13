"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, type User, OAuthProvider, GoogleAuthProvider as GAuthProvider } from "firebase/auth";
import { auth, googleProvider, signInWithCredential, GoogleAuthProvider } from "@/app/lib/firebase-client";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  nickname: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOutUser: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  refreshNickname: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  nickname: null,
  signInWithGoogle: async () => {},
  signInWithApple: async () => {},
  signOutUser: async () => {},
  getIdToken: async () => null,
  refreshNickname: async () => {},
});

/**
 * 인앱 브라우저(WebView) 감지
 */
function isInAppBrowser(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return /naver|kakaotalk|instagram|fbav|fban|line\/|band\/|everytimeapp/i.test(ua)
    || (/wv\)/.test(ua) && /android/i.test(ua));
}

function openInExternalBrowser() {
  const url = window.location.href;
  const ua = navigator.userAgent.toLowerCase();

  // Android: Chrome intent → 실패 시 기본 브라우저 fallback
  if (/android/i.test(ua)) {
    window.location.href = `intent://${url.replace(/^https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
    return;
  }

  // iOS 카카오톡: kakaotalk 스킴으로 외부 브라우저 열기
  if (/kakaotalk/i.test(ua)) {
    window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
    return;
  }

  // iOS 네이버앱: naversearchapp 스킴
  if (/naver/i.test(ua) && /iphone|ipad|ipod/i.test(ua)) {
    window.location.href = `naversearchapp://inappbrowser?url=${encodeURIComponent(url)}&target=browser`;
    return;
  }

  // 기타 iOS 인앱 브라우저: Safari로 열기 시도
  if (/iphone|ipad|ipod/i.test(ua)) {
    // x-web-search로 Safari 강제 실행
    window.location.href = url;
    setTimeout(() => { window.open(url, "_system"); }, 300);
    return;
  }

  window.open(url, "_blank");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [nickname, setNickname] = useState<string | null>(null);

  const NICKNAME_CACHE_KEY = "cached_nickname";
  const NICKNAME_UID_KEY = "cached_nickname_uid";

  const fetchNickname = async (uid: string, token: string, retries = 2) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(`/api/nicknames?uid=${uid}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const name = data.nickname || null;
          setNickname(name);
          if (name) {
            localStorage.setItem(NICKNAME_CACHE_KEY, name);
            localStorage.setItem(NICKNAME_UID_KEY, uid);
          }
          return;
        }
        if (res.status >= 400 && res.status < 500) break;
      } catch {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
      }
    }
    const cachedUid = localStorage.getItem(NICKNAME_UID_KEY);
    const cachedNickname = localStorage.getItem(NICKNAME_CACHE_KEY);
    if (cachedUid === uid && cachedNickname) {
      setNickname(cachedNickname);
    } else {
      setNickname(null);
    }
  };

  useEffect(() => {
    // redirect 로그인 결과 처리
    getRedirectResult(auth).catch(() => {});

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const token = await u.getIdToken();
        localStorage.setItem("fb_token", token);
        await fetchNickname(u.uid, token);
      } else {
        localStorage.removeItem("fb_token");
        setNickname(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    // 인앱 브라우저(카카오톡·네이버·인스타 등)에서는 자동으로 외부 브라우저로 이동
    if (isInAppBrowser()) {
      openInExternalBrowser();
      return;
    }

    // 모바일은 redirect, 데스크톱은 popup 방식 (third-party cookie 차단 우회)
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      try {
        await signInWithRedirect(auth, googleProvider);
      } catch (e) {
        console.error("Google 로그인 실패 (mobile)", e);
      }
      return;
    }

    // 데스크톱: popup 우선, 실패 시 redirect 폴백
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e: any) {
      console.warn("popup 실패, redirect로 폴백:", e?.code);
      try {
        await signInWithRedirect(auth, googleProvider);
      } catch (e2) {
        console.error("Google 로그인 실패", e2);
      }
    }
  };

  const signInWithApple = async () => {
    // 인앱 브라우저에서는 자동으로 외부 브라우저로 이동
    if (isInAppBrowser()) {
      openInExternalBrowser();
      return;
    }

    const provider = new OAuthProvider("apple.com");
    provider.addScope("email");
    provider.addScope("name");

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      try {
        await signInWithRedirect(auth, provider);
      } catch (e) {
        console.error("Apple 로그인 실패 (mobile)", e);
      }
      return;
    }

    try {
      await signInWithPopup(auth, provider);
    } catch (e: any) {
      console.warn("Apple popup 실패, redirect로 폴백:", e?.code);
      try {
        await signInWithRedirect(auth, provider);
      } catch (e2) {
        console.error("Apple 로그인 실패", e2);
      }
    }
  };

  const signOutUser = async () => {
    await signOut(auth);
    setNickname(null);
    localStorage.removeItem(NICKNAME_CACHE_KEY);
    localStorage.removeItem(NICKNAME_UID_KEY);
  };

  const getIdToken = async () => {
    if (!user) return null;
    return await user.getIdToken();
  };

  const refreshNickname = async () => {
    if (!user) return;
    const token = await user.getIdToken();
    await fetchNickname(user.uid, token);
  };

  return (
    <AuthContext.Provider value={{ user, loading, nickname, signInWithGoogle, signInWithApple, signOutUser, getIdToken, refreshNickname }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
