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

  const fetchNickname = async (uid: string, token: string) => {
    try {
      const res = await fetch(`/api/nicknames?uid=${uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNickname(data.nickname || null);
      }
    } catch {
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
