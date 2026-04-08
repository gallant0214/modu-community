"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, type User, OAuthProvider, GoogleAuthProvider as GAuthProvider } from "firebase/auth";
import { auth, googleProvider, signInWithCredential, GoogleAuthProvider } from "@/app/lib/firebase-client";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  nickname: string | null;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  refreshNickname: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  nickname: null,
  signInWithGoogle: async () => {},
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
  if (/android/i.test(ua)) {
    const intentUrl = `intent://${url.replace(/^https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;end`;
    window.location.href = intentUrl;
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
    // 인앱 브라우저에서는 외부 브라우저로 유도
    if (isInAppBrowser()) {
      const confirmed = confirm(
        "인앱 브라우저에서는 Google 로그인이 제한됩니다.\n\n외부 브라우저(Chrome/Safari)에서 열어서 로그인해 주세요.\n\n[확인]을 누르면 외부 브라우저로 이동합니다."
      );
      if (confirmed) {
        openInExternalBrowser();
      }
      return;
    }

    // 모바일: redirect 방식 (팝업이 느리거나 차단되므로)
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      try {
        await signInWithRedirect(auth, googleProvider);
      } catch {
        console.error("Google 로그인 실패 (mobile redirect)");
      }
      return;
    }

    // 데스크톱: popup 방식 (빠르고 자연스러움)
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e: any) {
      // popup 실패 시 redirect로 폴백
      if (e?.code === "auth/popup-blocked" || e?.code === "auth/popup-closed-by-user" || e?.code === "auth/cancelled-popup-request") {
        try {
          await signInWithRedirect(auth, googleProvider);
        } catch {
          console.error("Google 로그인 실패 (desktop redirect fallback)");
        }
      } else {
        console.error("Google 로그인 실패", e);
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
    <AuthContext.Provider value={{ user, loading, nickname, signInWithGoogle, signOutUser, getIdToken, refreshNickname }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
