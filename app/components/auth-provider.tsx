"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { auth, googleProvider } from "@/app/lib/firebase-client";

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
          // 서버 조회 성공 시 localStorage에 캐싱
          if (name) {
            localStorage.setItem(NICKNAME_CACHE_KEY, name);
            localStorage.setItem(NICKNAME_UID_KEY, uid);
          }
          return;
        }
        // 4xx 에러는 재시도 불필요
        if (res.status >= 400 && res.status < 500) break;
      } catch {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
      }
    }
    // 모든 시도 실패 시 캐시에서 복원
    const cachedUid = localStorage.getItem(NICKNAME_UID_KEY);
    const cachedNickname = localStorage.getItem(NICKNAME_CACHE_KEY);
    if (cachedUid === uid && cachedNickname) {
      setNickname(cachedNickname);
    } else {
      setNickname(null);
    }
  };

  useEffect(() => {
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
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error("Google 로그인 실패", e);
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
