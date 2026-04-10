"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  const { user, loading, nickname, signInWithGoogle, signOutUser, getIdToken } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  /* 알림 */
  const [notiOpen, setNotiOpen] = useState(false);
  const [notifications, setNotifications] = useState<WebNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notiRef = useRef<HTMLDivElement>(null);

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  // 페이지 이동 시 메뉴/알림 닫기
  useEffect(() => {
    setMenuOpen(false);
    setNotiOpen(false);
  }, [pathname]);

  // 알림 데이터 로드
  const fetchNotifications = async () => {
    const token = await getIdToken();
    if (!token) return;
    try {
      const res = await fetch("/api/notifications/web", { headers: { Authorization: `Bearer ${token}` } });
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

  const markAllRead = async () => {
    const token = await getIdToken();
    if (!token) return;
    try {
      await fetch("/api/notifications/web", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ readAll: true }),
      });
      // 서버에서 최신 상태 다시 가져오기
      await fetchNotifications();
    } catch {
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    }
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
          <NavLink href="/practical" active={isActive("/practical")}>
            실기·구술
          </NavLink>
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
        <div className="hidden md:flex items-center gap-2 shrink-0">
          {loading ? (
            <div className="w-16 h-7 bg-zinc-100 dark:bg-zinc-800 rounded-md animate-pulse" />
          ) : user ? (
            <div className="flex items-center gap-2">
              {/* 알림 아이콘 */}
              <div ref={notiRef} className="relative">
                <button
                  onClick={() => { setNotiOpen(!notiOpen); if (!notiOpen) fetchNotifications(); }}
                  className="relative p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>

                {/* 알림 드롭다운 */}
                {notiOpen && (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg overflow-hidden z-50">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
                      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">알림</span>
                      {unreadCount > 0 && (
                        <button onClick={markAllRead} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">모두 읽음</button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <p className="text-center text-sm text-zinc-400 py-8">알림이 없습니다</p>
                      ) : (
                        notifications.map((n) => (
                          <button
                            key={n.id}
                            onClick={() => { if (!n.is_read) markAsRead(n.id); }}
                            className={`w-full text-left px-4 py-3 border-b border-zinc-50 dark:border-zinc-800 last:border-0 transition-colors ${
                              n.is_read ? "bg-white dark:bg-zinc-900" : "bg-blue-50/50 dark:bg-blue-950/20"
                            } hover:bg-zinc-50 dark:hover:bg-zinc-800`}
                          >
                            <div className="flex items-start gap-2">
                              {!n.is_read && <span className="mt-1.5 w-2 h-2 bg-blue-500 rounded-full shrink-0" />}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                    n.broadcast_type === "event" ? "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400" :
                                    n.broadcast_type === "ad" ? "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400" :
                                    "bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-400"
                                  }`}>
                                    {n.broadcast_type === "event" ? "이벤트" : n.broadcast_type === "ad" ? "광고" : "공지"}
                                  </span>
                                  <span className="text-[10px] text-zinc-400">{timeAgo(n.created_at)}</span>
                                </div>
                                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{n.title}</p>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{n.body}</p>
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

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
              className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors font-medium"
            >
              로그인
            </button>
          )}
        </div>

        {/* 모바일: 우측 영역 */}
        <div className="flex md:hidden items-center gap-1 ml-auto">
          {/* 모바일 로그인 버튼 (비로그인 시) */}
          {!loading && !user && (
            <button
              onClick={signInWithGoogle}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 font-medium"
            >
              로그인
            </button>
          )}

          {/* 모바일 알림 아이콘 (로그인 시) */}
          {!loading && user && (
            <div ref={notiRef} className="relative">
              <button
                onClick={() => { setNotiOpen(!notiOpen); if (!notiOpen) fetchNotifications(); }}
                className="relative p-1.5 text-zinc-500 dark:text-zinc-400"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {/* 모바일 알림 드롭다운 */}
              {notiOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg overflow-hidden z-50">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
                    <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">알림</span>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="text-xs text-blue-600 dark:text-blue-400">모두 읽음</button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="text-center text-sm text-zinc-400 py-8">알림이 없습니다</p>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => { if (!n.is_read) markAsRead(n.id); }}
                          className={`w-full text-left px-4 py-3 border-b border-zinc-50 dark:border-zinc-800 last:border-0 ${
                            n.is_read ? "" : "bg-blue-50/50 dark:bg-blue-950/20"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            {!n.is_read && <span className="mt-1.5 w-2 h-2 bg-blue-500 rounded-full shrink-0" />}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  n.broadcast_type === "event" ? "bg-blue-100 text-blue-600" :
                                  n.broadcast_type === "ad" ? "bg-amber-100 text-amber-600" :
                                  "bg-violet-100 text-violet-600"
                                }`}>
                                  {n.broadcast_type === "event" ? "이벤트" : n.broadcast_type === "ad" ? "광고" : "공지"}
                                </span>
                                <span className="text-[10px] text-zinc-400">{timeAgo(n.created_at)}</span>
                              </div>
                              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{n.title}</p>
                              <p className="text-xs text-zinc-500 truncate">{n.body}</p>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
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
            <MobileNavLink href="/practical" active={isActive("/practical")} onClick={() => setMenuOpen(false)}>
              실기·구술
            </MobileNavLink>
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
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700"
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

function GoogleIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}
