"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/app/components/auth-provider";

export function NavBar() {
  const pathname = usePathname();
  const { user, loading, nickname, signInWithGoogle, signOutUser } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  // 페이지 이동 시 메뉴 닫기
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // 외부 클릭 시 메뉴 닫기
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2)]"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="mx-auto max-w-5xl px-4 h-14 flex items-center">
        {/* 로고 */}
        <Link href="/" className="flex items-center gap-2 mr-3 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="로고" className="w-7 h-7 rounded" />
          <span className="text-base font-bold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">모두의 지도사</span>
        </Link>

        {/* 데스크톱 메뉴 */}
        <div className="hidden md:flex items-center gap-0.5 flex-1">
          <NavLink href="/" active={isActive("/") && !isActive("/community") && !isActive("/category") && !isActive("/jobs") && !isActive("/practical") && !isActive("/my")}>
            소개
          </NavLink>
          <ExternalNavLink href="https://moducm-practical.vercel.app">
            실기·구술
          </ExternalNavLink>
          <NavLink href="/community" active={isActive("/community") || isActive("/category")}>
            종목별 커뮤니티
          </NavLink>
          <NavLink href="/jobs" active={isActive("/jobs")}>
            스포츠 구인
          </NavLink>
          <NavLink href="/#faq" active={false}>
            FAQ
          </NavLink>
          <NavLink href="/my" active={isActive("/my")}>
            MY
          </NavLink>
        </div>

        {/* 데스크톱 로그인/로그아웃 */}
        <div className="hidden md:block shrink-0">
          {loading ? (
            <div className="w-16 h-7 bg-zinc-100 dark:bg-zinc-800 rounded-md animate-pulse" />
          ) : user ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-600 dark:text-zinc-400 max-w-[80px] truncate">
                {nickname || user.displayName || "사용자"}
              </span>
              <button
                onClick={signOutUser}
                className="text-xs px-3 py-1.5 rounded-md text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                로그아웃
              </button>
            </div>
          ) : (
            <button
              onClick={signInWithGoogle}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors font-medium"
            >
              <GoogleIcon />
              로그인
            </button>
          )}
        </div>

        {/* 모바일: 우측 영역 */}
        <div className="flex md:hidden items-center gap-2 ml-auto">
          {/* 모바일 로그인 버튼 (비로그인 시) */}
          {!loading && !user && (
            <button
              onClick={signInWithGoogle}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium"
            >
              <GoogleIcon />
              로그인
            </button>
          )}

          {/* 햄버거 버튼 */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
            aria-label="메뉴 열기"
          >
            {menuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* 모바일 드롭다운 메뉴 */}
      {menuOpen && (
        <div
          ref={menuRef}
          className="md:hidden bg-white dark:bg-zinc-950 border-t border-zinc-100 dark:border-zinc-800 shadow-lg"
        >
          <div className="px-4 py-2 space-y-0.5">
            <MobileNavLink href="/" active={isActive("/") && !isActive("/community") && !isActive("/category") && !isActive("/jobs") && !isActive("/practical") && !isActive("/my")} onClick={() => setMenuOpen(false)}>
              소개
            </MobileNavLink>
            <MobileExternalLink href="https://moducm-practical.vercel.app" onClick={() => setMenuOpen(false)}>
              실기·구술
            </MobileExternalLink>
            <MobileNavLink href="/community" active={isActive("/community") || isActive("/category")} onClick={() => setMenuOpen(false)}>
              종목별 커뮤니티
            </MobileNavLink>
            <MobileNavLink href="/jobs" active={isActive("/jobs")} onClick={() => setMenuOpen(false)}>
              스포츠 구인
            </MobileNavLink>
            <MobileNavLink href="/#faq" active={false} onClick={() => setMenuOpen(false)}>
              FAQ
            </MobileNavLink>
            <MobileNavLink href="/my" active={isActive("/my")} onClick={() => setMenuOpen(false)}>
              MY
            </MobileNavLink>
          </div>

          {/* 모바일 메뉴 하단: 로그인/유저 정보 */}
          <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-800">
            {loading ? (
              <div className="w-full h-9 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
            ) : user ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                      {(nickname || user.displayName || "U")[0].toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate max-w-[150px]">
                    {nickname || user.displayName || "사용자"}
                  </span>
                </div>
                <button
                  onClick={() => { signOutUser(); setMenuOpen(false); }}
                  className="text-xs px-3 py-1.5 rounded-md text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  로그아웃
                </button>
              </div>
            ) : (
              <button
                onClick={() => { signInWithGoogle(); setMenuOpen(false); }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium"
              >
                <GoogleIcon />
                Google로 로그인
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

/* 데스크톱 외부 링크 */
function ExternalNavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="relative text-sm px-3 py-1.5 rounded-md transition-colors font-medium whitespace-nowrap text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
    >
      {children}
    </a>
  );
}

/* 데스크톱 메뉴 링크 */
function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`relative text-sm px-3 py-1.5 rounded-md transition-colors font-medium whitespace-nowrap ${
        active
          ? "text-blue-600 dark:text-blue-400 font-semibold"
          : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
      }`}
    >
      {children}
      {active && (
        <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
      )}
    </Link>
  );
}

/* 모바일 메뉴 링크 */
/* 모바일 외부 링크 */
function MobileExternalLink({ href, onClick, children }: { href: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className="block px-3 py-3 rounded-lg text-sm font-medium transition-colors text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900"
    >
      {children}
    </a>
  );
}

function MobileNavLink({ href, active, onClick, children }: { href: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`block px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 font-semibold"
          : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900"
      }`}
    >
      {children}
    </Link>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}
