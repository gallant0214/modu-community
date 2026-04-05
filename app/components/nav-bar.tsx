"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/app/components/auth-provider";

export function NavBar() {
  const pathname = usePathname();
  const { user, loading, nickname, signInWithGoogle, signOutUser } = useAuth();

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2)]"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="mx-auto max-w-5xl px-4 h-14 flex items-center gap-2">
        {/* 로고 */}
        <Link href="/" className="flex items-center gap-2 mr-4 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="로고" className="w-7 h-7 rounded" />
          <span className="text-base font-bold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">모두의 지도사</span>
        </Link>

        {/* 메뉴 */}
        <div className="flex items-center gap-1 flex-1">
          <NavLink href="/" active={isActive("/") && !isActive("/community") && !isActive("/category") && !isActive("/jobs") && !isActive("/practical") && !isActive("/my")}>
            소개
          </NavLink>
          <NavLink href="/community" active={isActive("/community") || isActive("/category")}>
            종목별 커뮤니티
          </NavLink>
          <NavLink href="/jobs" active={isActive("/jobs")}>
            구인
          </NavLink>
        </div>

        {/* 우측: CTA + 프로필 */}
        <div className="flex items-center gap-2 shrink-0">
          {/* 공고 등록 CTA */}
          <Link
            href="/jobs/write"
            className="hidden sm:flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            공고 등록
          </Link>

          {/* 로그인/프로필 */}
          {loading ? (
            <div className="w-16 h-8 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
          ) : user ? (
            <div className="flex items-center gap-2">
              <Link
                href="/my"
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <span className="hidden sm:block text-xs text-zinc-600 dark:text-zinc-400 max-w-[80px] truncate">
                  {nickname || user.displayName || "사용자"}
                </span>
              </Link>
              <button
                onClick={signOutUser}
                className="text-xs px-2 py-1 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                로그아웃
              </button>
            </div>
          ) : (
            <button
              onClick={signInWithGoogle}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors font-medium"
            >
              <GoogleIcon />
              로그인
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`relative text-sm px-3 py-1.5 rounded-md transition-colors ${
        active
          ? "text-blue-600 dark:text-blue-400 font-semibold"
          : "text-zinc-500 dark:text-zinc-400 font-medium hover:text-zinc-900 dark:hover:text-zinc-100"
      }`}
    >
      {children}
      {active && (
        <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
      )}
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
