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

/** Android: Chrome intent로 외부 브라우저 열기 */
function openInExternalBrowserAndroid() {
  const url = window.location.href;
  window.location.href = `intent://${url.replace(/^https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
}

/** iOS 인앱 브라우저 가이드 오버레이 표시 */
function showIOSGuideOverlay() {
  if (document.getElementById("inapp-guide-overlay")) return;

  const url = window.location.href;
  const overlay = document.createElement("div");
  overlay.id = "inapp-guide-overlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(42,37,29,0.85);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:24px;";
  overlay.innerHTML = `
    <div style="background:#FEFCF7;border-radius:24px;padding:32px 24px;max-width:340px;width:100%;text-align:center;box-shadow:0 24px 48px -16px rgba(0,0,0,0.3);">
      <div style="width:56px;height:56px;border-radius:16px;background:#F5F0E5;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
        <svg width="28" height="28" fill="none" stroke="#6B7B3A" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
      </div>
      <h3 style="font-size:17px;font-weight:800;color:#2A251D;margin-bottom:6px;letter-spacing:-0.03em;">Safari에서 열어주세요</h3>
      <p style="font-size:13px;color:#6B5D47;line-height:1.6;margin-bottom:20px;">
        카카오톡 등 인앱 브라우저에서는<br/>Google·Apple 로그인이 제한됩니다.<br/>아래 버튼으로 주소를 복사한 뒤<br/><strong>Safari</strong>에 붙여넣기 해주세요.
      </p>
      <button id="inapp-copy-btn" style="width:100%;padding:14px;border-radius:14px;background:#6B7B3A;color:#fff;font-size:14px;font-weight:700;border:none;cursor:pointer;margin-bottom:10px;box-shadow:0 6px 18px -8px rgba(107,123,58,0.5);">
        주소 복사하기
      </button>
      <button id="inapp-close-btn" style="width:100%;padding:12px;border-radius:14px;background:transparent;color:#8C8270;font-size:13px;font-weight:600;border:1px solid #E8E0D0;cursor:pointer;">
        닫기
      </button>
      <p id="inapp-copied-msg" style="display:none;margin-top:10px;font-size:12px;color:#6B7B3A;font-weight:700;">✓ 주소가 복사되었습니다!</p>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById("inapp-copy-btn")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // fallback: textarea 복사
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.cssText = "position:fixed;left:-9999px;";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    const msg = document.getElementById("inapp-copied-msg");
    if (msg) msg.style.display = "block";
    const btn = document.getElementById("inapp-copy-btn");
    if (btn) { btn.textContent = "복사 완료! Safari에 붙여넣기 하세요"; btn.style.background = "#5A6930"; }
  });

  document.getElementById("inapp-close-btn")?.addEventListener("click", () => {
    overlay.remove();
  });
}

function openInExternalBrowser() {
  const ua = navigator.userAgent.toLowerCase();

  // Android: Chrome intent (신뢰성 높음)
  if (/android/i.test(ua)) {
    openInExternalBrowserAndroid();
    return;
  }

  // iOS: 프로그래밍으로 Safari를 열 수 없으므로 가이드 오버레이 표시
  showIOSGuideOverlay();
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
    // redirect 로그인 결과 처리 (비동기, 블로킹 안 함)
    getRedirectResult(auth).catch(() => {});

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        // 1단계: 캐시된 닉네임으로 즉시 로그인 완료 표시 (빠름)
        const cachedUid = localStorage.getItem(NICKNAME_UID_KEY);
        const cachedNickname = localStorage.getItem(NICKNAME_CACHE_KEY);
        if (cachedUid === u.uid && cachedNickname) {
          setNickname(cachedNickname);
        }
        setLoading(false); // 즉시 로딩 해제 — 화면 먼저 보여줌

        // 2단계: 토큰 + 닉네임을 백그라운드에서 갱신 (블로킹 안 함)
        u.getIdToken().then((token) => {
          localStorage.setItem("fb_token", token);
          fetchNickname(u.uid, token); // await 안 함 — 백그라운드
        }).catch(() => {});
      } else {
        localStorage.removeItem("fb_token");
        setNickname(null);
        setLoading(false);
      }
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
