"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/app/components/auth-provider";

interface WebNotification {
  id: number;
  title: string;
  body: string;
  broadcast_type: string;
  created_at: string;
  is_read: boolean;
}

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, nickname, signInWithGoogle, signInWithApple, signOutUser, getIdToken } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  /* 알림 */
  const [notiOpen, setNotiOpen] = useState(false);
  const [notifications, setNotifications] = useState<WebNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notiRef = useRef<HTMLDivElement>(null);

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  const isHome = isActive("/") && !isActive("/community") && !isActive("/category") && !isActive("/jobs") && !isActive("/practical") && !isActive("/my");

  // 페이지 이동 시 메뉴/알림 닫기
  useEffect(() => {
    setMenuOpen(false);
    setNotiOpen(false);
  }, [pathname]);

  // body scroll lock while mobile menu open
  useEffect(() => {
    if (menuOpen) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = original; };
    }
  }, [menuOpen]);

  // 알림 데이터 로드
  const fetchNotifications = async () => {
    const token = await getIdToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/notifications/web?t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" },
        cache: "no-store",
      });
      const data = await res.json();
      if (data.notifications) setNotifications(data.notifications);
      if (data.unreadCount !== undefined) setUnreadCount(data.unreadCount);
    } catch {}
  };

  useEffect(() => {
    if (user && !loading) fetchNotifications();
  }, [user, loading]);

  // 알림 읽음 처리
  const markAsRead = async (id: number) => {
    const token = await getIdToken();
    if (!token) return;
    fetch("/api/notifications/web", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ notificationId: id }),
    }).catch(() => {});
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const handleNotificationClick = (n: WebNotification) => {
    if (!n.is_read) markAsRead(n.id);
    setNotiOpen(false);
    router.push(`/my?tab=notifications&highlight=${n.id}`);
  };

  const markAllRead = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    // 낙관적 업데이트: UI를 즉시 갱신
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);

    const token = await getIdToken();
    if (!token) return;
    // 백그라운드 동기화 (실패해도 UI는 이미 갱신됨)
    fetch("/api/notifications/web", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ readAll: true }),
    }).catch(() => {});
  };

  // 알림 외부 클릭 닫기
  useEffect(() => {
    if (!notiOpen) return;
    function handleClick(e: MouseEvent) {
      if (notiRef.current && !notiRef.current.contains(e.target as Node)) setNotiOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [notiOpen]);

  // 외부 클릭 시 메뉴 닫기 (햄버거 버튼 클릭은 제외)
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      const insideMenu = menuRef.current?.contains(target);
      const insideButton = menuButtonRef.current?.contains(target);
      if (!insideMenu && !insideButton) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const userInitial = (nickname || user?.displayName || "U")[0].toUpperCase();
  const userDisplayName = nickname || user?.displayName || "사용자";

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 bg-[#F8F4EC]/85 dark:bg-zinc-950/85 backdrop-blur-md border-b border-[#E8E0D0]/70 dark:border-zinc-800"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="mx-auto max-w-5xl px-4 h-14 flex items-center">
        {/* 로고 */}
        <Link href="/" className="flex items-center gap-2 mr-4 shrink-0 group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="로고" className="w-7 h-7 rounded-lg" />
          <span className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 whitespace-nowrap tracking-tight">모두의 지도사</span>
        </Link>

        {/* 데스크톱 메뉴 */}
        <div className="hidden md:flex items-center gap-1 flex-1">
          <NavLink href="/" active={isHome}>소개</NavLink>
          <NavLink href="/practical" active={isActive("/practical")}>실기·구술</NavLink>
          <NavLink href="/community" active={isActive("/community") || isActive("/category")}>종목별 커뮤니티</NavLink>
          <NavLink href="/jobs" active={isActive("/jobs")}>스포츠 구인</NavLink>
          <NavLink href="/#faq" active={false}>FAQ</NavLink>
          <NavLink href="/my" active={isActive("/my")}>MY</NavLink>
        </div>

        {/* 데스크톱 로그인/로그아웃 */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          {loading ? (
            <div className="w-20 h-8 bg-[#EFE7D5] dark:bg-zinc-800 rounded-lg animate-pulse" />
          ) : user ? (
            <div className="flex items-center gap-2">
              {/* 알림 아이콘 */}
              <div ref={notiRef} className="relative">
                <button
                  onClick={() => { setNotiOpen(!notiOpen); if (!notiOpen) fetchNotifications(); }}
                  aria-label="알림"
                  className={`relative w-9 h-9 flex items-center justify-center rounded-xl border transition-all ${
                    notiOpen
                      ? "border-[#6B7B3A]/50 bg-[#F5F0E5] text-[#6B7B3A]"
                      : "border-transparent text-[#6B5D47] dark:text-zinc-400 hover:border-[#E8E0D0] hover:bg-[#FEFCF7]/60 dark:hover:bg-zinc-800"
                  }`}
                >
                  <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-[#C0392B] text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-[0_2px_6px_-2px_rgba(192,57,43,0.5)]">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>

                <NotificationDropdown
                  open={notiOpen}
                  notifications={notifications}
                  unreadCount={unreadCount}
                  onMarkAll={markAllRead}
                  onClickItem={handleNotificationClick}
                  onViewAll={() => { setNotiOpen(false); router.push("/my?tab=notifications"); }}
                  variant="desktop"
                />
              </div>

              {/* 유저 블록 */}
              <div className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-xl bg-[#FEFCF7]/70 dark:bg-zinc-900 border border-[#E8E0D0]/70 dark:border-zinc-700">
                {user.photoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.photoURL}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="shrink-0 w-6 h-6 rounded-full object-cover bg-[#F5F0E5]"
                  />
                ) : (
                  <span className="shrink-0 w-6 h-6 rounded-full bg-[#6B7B3A] text-white text-[11px] font-bold flex items-center justify-center">
                    {userInitial}
                  </span>
                )}
                <span className="text-[12px] font-medium text-[#3A342A] dark:text-zinc-200 max-w-[100px] truncate">
                  {userDisplayName}
                </span>
                <button
                  onClick={signOutUser}
                  className="text-[11px] px-2 py-1 rounded-lg text-[#8C8270] hover:text-[#3A342A] hover:bg-[#F5F0E5] dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                >
                  로그아웃
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setLoginModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-4 py-2 rounded-xl bg-[#6B7B3A] hover:bg-[#5A6930] text-white shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)] transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/>
              </svg>
              로그인
            </button>
          )}
        </div>

        {/* 모바일: 우측 영역 */}
        <div className="flex md:hidden items-center gap-1 ml-auto">
          {/* 모바일 로그인 버튼 (비로그인 시) */}
          {!loading && !user && (
            <button
              onClick={() => setLoginModalOpen(true)}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-[#6B7B3A] hover:bg-[#5A6930] text-white shadow-[0_2px_8px_-2px_rgba(107,123,58,0.4)]"
            >
              로그인
            </button>
          )}

          {/* 모바일 알림 아이콘 (로그인 시) */}
          {!loading && user && (
            <div ref={notiRef} className="relative">
              <button
                onClick={() => { setNotiOpen(!notiOpen); if (!notiOpen) fetchNotifications(); }}
                aria-label="알림"
                className={`relative w-9 h-9 flex items-center justify-center rounded-xl transition-colors ${
                  notiOpen ? "bg-[#F5F0E5] text-[#6B7B3A]" : "text-[#6B5D47] dark:text-zinc-400"
                }`}
              >
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-[#C0392B] text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-[0_2px_6px_-2px_rgba(192,57,43,0.5)]">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              <NotificationDropdown
                open={notiOpen}
                notifications={notifications}
                unreadCount={unreadCount}
                onMarkAll={markAllRead}
                onClickItem={handleNotificationClick}
                onViewAll={() => { setNotiOpen(false); router.push("/my?tab=notifications"); }}
                variant="mobile"
              />
            </div>
          )}

          {/* 햄버거 버튼 */}
          <button
            ref={menuButtonRef}
            onClick={() => setMenuOpen(!menuOpen)}
            className={`w-9 h-9 flex items-center justify-center rounded-xl transition-colors ${
              menuOpen ? "bg-[#F5F0E5] text-[#6B7B3A]" : "text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5]/70"
            }`}
            aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
          >
            {menuOpen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* ══════ 모바일 메뉴 시트 ══════ */}
      {menuOpen && (
        <>
          {/* 백드롭 */}
          <div
            className="md:hidden fixed inset-0 top-14 bg-[#2A251D]/40 backdrop-blur-sm z-40 animate-fade-in"
            style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
            aria-hidden
          />
          {/* 시트 */}
          <div
            ref={menuRef}
            className="md:hidden fixed left-0 right-0 top-14 z-40 mx-3 mt-2 rounded-3xl bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 shadow-[0_20px_48px_-16px_rgba(107,93,71,0.35)] overflow-hidden animate-slide-down"
            style={{ marginTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
          >
            <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/35 to-transparent" />

            {/* 킥커 */}
            <div className="px-5 pt-5 pb-2">
              <div className="inline-flex items-center gap-2">
                <span className="w-5 h-px bg-[#6B7B3A]" />
                <span className="text-[10px] font-bold tracking-[0.15em] text-[#6B7B3A] uppercase">Navigation</span>
              </div>
            </div>

            {/* 메뉴 링크 */}
            <div className="px-3 pb-3 pt-1 space-y-0.5">
              <MobileNavLink href="/" active={isHome} onClick={() => setMenuOpen(false)} icon="home">소개</MobileNavLink>
              <MobileNavLink href="/practical" active={isActive("/practical")} onClick={() => setMenuOpen(false)} icon="book">실기·구술</MobileNavLink>
              <MobileNavLink href="/community" active={isActive("/community") || isActive("/category")} onClick={() => setMenuOpen(false)} icon="chat">종목별 커뮤니티</MobileNavLink>
              <MobileNavLink href="/jobs" active={isActive("/jobs")} onClick={() => setMenuOpen(false)} icon="briefcase">스포츠 구인</MobileNavLink>
              <MobileNavLink href="/#faq" active={false} onClick={() => setMenuOpen(false)} icon="help">FAQ</MobileNavLink>
              <MobileNavLink href="/my" active={isActive("/my")} onClick={() => setMenuOpen(false)} icon="user">MY</MobileNavLink>
            </div>

            {/* 하단 유저/로그인 블록 */}
            <div className="border-t border-[#E8E0D0]/60 dark:border-zinc-800 bg-[#FBF7EB]/60 dark:bg-zinc-800/40 px-5 py-4">
              {loading ? (
                <div className="w-full h-12 bg-[#EFE7D5] dark:bg-zinc-800 rounded-2xl animate-pulse" />
              ) : user ? (
                <div className="flex items-center gap-3">
                  {user.photoURL ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.photoURL}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="shrink-0 w-11 h-11 rounded-2xl object-cover bg-[#F5F0E5] shadow-[0_4px_14px_-4px_rgba(107,123,58,0.3)]"
                    />
                  ) : (
                    <div className="shrink-0 w-11 h-11 rounded-2xl bg-[#6B7B3A] text-white font-bold text-base flex items-center justify-center shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)]">
                      {userInitial}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-[#2A251D] dark:text-zinc-100 truncate">
                      {userDisplayName}
                    </p>
                    {user.email && (
                      <p className="text-[11px] text-[#8C8270] dark:text-zinc-500 truncate">{user.email}</p>
                    )}
                  </div>
                  <button
                    onClick={() => { signOutUser(); setMenuOpen(false); }}
                    className="shrink-0 text-[11px] font-semibold px-3 py-2 rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] transition-colors"
                  >
                    로그아웃
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setMenuOpen(false); setLoginModalOpen(true); }}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#6B7B3A] hover:bg-[#5A6930] text-white text-[14px] font-bold shadow-[0_8px_24px_-8px_rgba(107,123,58,0.5)] transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/>
                  </svg>
                  로그인 / 회원가입
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* ══════ 로그인 모달 ══════ */}
      {loginModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-[#2A251D]/50 backdrop-blur-sm" onClick={() => setLoginModalOpen(false)} />
          <div className="relative w-full max-w-sm bg-[#FEFCF7] dark:bg-zinc-900 rounded-3xl shadow-2xl border border-[#E8E0D0] dark:border-zinc-700 p-7 sm:p-8 overflow-hidden">
            <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/40 to-transparent" />
            <div aria-hidden className="absolute -top-16 -right-10 w-40 h-40 rounded-full bg-[#6B7B3A]/[0.06] blur-3xl pointer-events-none" />

            {/* 닫기 버튼 */}
            <button
              onClick={() => setLoginModalOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-[#8C8270] hover:text-[#3A342A] hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors z-10"
              aria-label="닫기"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="relative">
              {/* 아이콘 */}
              <div className="w-14 h-14 rounded-2xl bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-[#6B7B3A] dark:text-[#A8B87A]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>

              {/* 킥커 */}
              <div className="flex items-center justify-center gap-2 mb-3">
                <span className="w-5 h-px bg-[#6B7B3A]" />
                <span className="text-[10px] font-bold tracking-[0.15em] text-[#6B7B3A] uppercase">Sign In</span>
                <span className="w-5 h-px bg-[#6B7B3A]" />
              </div>

              {/* 타이틀 */}
              <h2 className="text-[19px] font-bold text-center text-[#2A251D] dark:text-zinc-100 mb-1.5 tracking-tight">환영합니다</h2>
              <p className="text-[12px] text-center text-[#6B5D47] dark:text-zinc-400 mb-6 leading-relaxed">
                간편 로그인으로 바로 시작해 보세요
              </p>

              {/* Google 로그인 */}
              <button
                onClick={() => { setLoginModalOpen(false); signInWithGoogle(); }}
                className="w-full flex items-center justify-center gap-3 px-5 py-3.5 bg-[#FEFCF7] dark:bg-zinc-800 border border-[#E8E0D0] dark:border-zinc-600 rounded-2xl text-[13px] font-semibold text-[#3A342A] dark:text-zinc-200 hover:bg-[#F5F0E5] dark:hover:bg-zinc-700 hover:border-[#6B7B3A]/40 transition-all mb-2"
              >
                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Google로 로그인
              </button>

              {/* Apple 로그인 */}
              <button
                onClick={() => { setLoginModalOpen(false); signInWithApple(); }}
                className="w-full flex items-center justify-center gap-3 px-5 py-3.5 bg-[#2A251D] hover:bg-black text-white rounded-2xl text-[13px] font-semibold transition-all"
              >
                <svg className="w-[18px] h-[18px]" viewBox="0 0 384 512" fill="currentColor">
                  <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
                </svg>
                Apple로 로그인
              </button>

              <p className="text-[11px] text-center text-[#A89B80] dark:text-zinc-500 mt-5">
                가입 없이 바로 시작할 수 있어요
              </p>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

/* ── 알림 드롭다운 ── */
function NotificationDropdown({
  open,
  notifications,
  unreadCount,
  onMarkAll,
  onClickItem,
  onViewAll,
  variant,
}: {
  open: boolean;
  notifications: WebNotification[];
  unreadCount: number;
  onMarkAll: (e: React.MouseEvent) => void;
  onClickItem: (n: WebNotification) => void;
  onViewAll: () => void;
  variant: "desktop" | "mobile";
}) {
  if (!open) return null;
  const width = variant === "desktop" ? "w-80" : "w-72";
  const maxH = variant === "desktop" ? "max-h-80" : "max-h-64";

  return (
    <div className={`absolute right-0 top-full mt-2 ${width} bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl shadow-[0_16px_40px_-16px_rgba(107,93,71,0.3)] overflow-hidden z-50`}>
      <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B7B3A]/35 to-transparent" />
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8E0D0]/70 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="w-1 h-3.5 rounded-full bg-[#6B7B3A]" />
          <span className="text-[13px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight">알림</span>
          {unreadCount > 0 && (
            <span className="text-[10px] font-bold text-[#6B7B3A]">{unreadCount}</span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onMarkAll(e); }}
            className="text-[11px] font-semibold text-[#6B7B3A] dark:text-[#A8B87A] hover:text-[#5A6930] px-2 py-1 rounded-lg hover:bg-[#F5F0E5] transition-colors"
          >
            모두 읽음
          </button>
        )}
      </div>
      <div className={`${maxH} overflow-y-auto`}>
        {notifications.length === 0 ? (
          <div className="py-10 text-center">
            <div className="inline-flex w-10 h-10 mb-2 rounded-xl bg-[#F5F0E5] dark:bg-zinc-800 items-center justify-center">
              <svg className="w-5 h-5 text-[#A89B80]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <p className="text-[12px] text-[#8C8270] dark:text-zinc-500">알림이 없습니다</p>
          </div>
        ) : (
          notifications.slice(0, 5).map((n) => (
            <button
              key={n.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onClickItem(n); }}
              className={`w-full text-left px-4 py-3 border-b border-[#E8E0D0]/50 dark:border-zinc-800 last:border-0 transition-colors ${
                n.is_read
                  ? "hover:bg-[#F5F0E5]/60 dark:hover:bg-zinc-800/60"
                  : "bg-[#FBF7EB] dark:bg-[#6B7B3A]/10 hover:bg-[#F5F0E5] dark:hover:bg-[#6B7B3A]/20"
              }`}
            >
              <div className="flex items-start gap-2">
                {!n.is_read && <span className="mt-1.5 w-1.5 h-1.5 bg-[#6B7B3A] rounded-full shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                      n.broadcast_type === "event"
                        ? "bg-[#EFE7D5] text-[#6B7B3A] dark:bg-[#6B7B3A]/20 dark:text-[#A8B87A]"
                        : n.broadcast_type === "ad"
                          ? "bg-[#F5E4C8] text-[#B47B2A] dark:bg-amber-950/40 dark:text-amber-300"
                          : "bg-[#F5F0E5] text-[#6B5D47] dark:bg-zinc-800 dark:text-zinc-300"
                    }`}>
                      {n.broadcast_type === "event" ? "이벤트" : n.broadcast_type === "ad" ? "광고" : "공지"}
                    </span>
                    <span className="text-[10px] text-[#A89B80]">{timeAgo(n.created_at)}</span>
                  </div>
                  <p className="text-[13px] font-semibold text-[#2A251D] dark:text-zinc-100 truncate">{n.title}</p>
                  <p className="text-[11px] text-[#8C8270] dark:text-zinc-500 truncate">{n.body}</p>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
      {notifications.length > 0 && (
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onViewAll(); }}
          className="w-full px-4 py-3 border-t border-[#E8E0D0]/70 dark:border-zinc-800 text-[12px] font-semibold text-[#6B7B3A] dark:text-[#A8B87A] hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors"
        >
          전체보기
        </button>
      )}
    </div>
  );
}

/* ── 데스크톱 메뉴 링크 ── */
function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`relative text-[13px] px-3.5 py-1.5 rounded-full transition-all font-medium whitespace-nowrap ${
        active
          ? "text-[#6B7B3A] bg-[#EFE7D5] dark:bg-[#6B7B3A]/20 dark:text-[#A8B87A] font-bold"
          : "text-[#6B5D47] dark:text-zinc-400 hover:text-[#3A342A] dark:hover:text-zinc-100 hover:bg-[#F5F0E5]/60 dark:hover:bg-zinc-800"
      }`}
    >
      {children}
    </Link>
  );
}

/* ── 모바일 메뉴 링크 ── */
function MobileNavLink({
  href,
  active,
  onClick,
  children,
  icon,
}: {
  href: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon?: "home" | "book" | "chat" | "briefcase" | "help" | "user";
}) {
  const iconPath = {
    home: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
    book: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
    chat: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
    briefcase: "M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
    help: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    user: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  }[icon || "home"];

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl text-[14px] font-semibold transition-colors ${
        active
          ? "bg-[#EFE7D5] dark:bg-[#6B7B3A]/20 text-[#6B7B3A] dark:text-[#A8B87A]"
          : "text-[#3A342A] dark:text-zinc-200 hover:bg-[#F5F0E5]/70 dark:hover:bg-zinc-800"
      }`}
    >
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
        active ? "bg-[#6B7B3A] text-white shadow-[0_4px_14px_-4px_rgba(107,123,58,0.4)]" : "bg-[#F5F0E5] dark:bg-zinc-800 text-[#6B5D47] dark:text-zinc-400"
      }`}>
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
        </svg>
      </span>
      <span className="flex-1">{children}</span>
      <svg className={`w-4 h-4 ${active ? "text-[#6B7B3A]" : "text-[#A89B80]"}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
      </svg>
    </Link>
  );
}

function timeAgo(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}일 전`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
