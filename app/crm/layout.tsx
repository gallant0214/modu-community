"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/app/components/auth-provider";
import { CrmSidebar } from "./_components/crm-sidebar";
import { CrmThemeProvider } from "./_components/crm-theme";
import { CrmToastProvider } from "./_components/crm-toast";
import { getCenterCookie, clearCenterCookie } from "./_components/crm-center-cookie";

type Role = "owner" | "admin" | "manager" | "trainer";

interface BootstrapResp {
  onboarded: boolean;
  accessDenied?: boolean;
  centerId?: number;
  centerMemberId?: number | null;
  centerName?: string;
  centerKind?: "solo" | "center";
  centerLogo?: string | null;
  role?: Role;
  accessLevel?: "admin" | "schedule" | "none";
  isSoloOwner?: boolean;
  permissions?: Record<string, boolean>;
}

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, getIdToken, signInWithGoogle, signInWithApple } = useAuth();
  const [ctx, setCtx] = useState<BootstrapResp | null>(null);
  const [error, setError] = useState("");

  const isOnboarding = pathname === "/crm/onboarding";
  const isTouch = pathname === "/crm/touch-attendance";
  const isSelect = pathname === "/crm/select";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (loading || !user) return;
      // 진입 선택: 어떤 센터/개인 CRM 으로 들어갈지 아직 안 골랐으면(쿠키 없음) 선택 화면으로.
      // 선택기·온보딩·터치출석 화면은 예외(무한 리다이렉트 방지).
      if (!isSelect && !isOnboarding && !isTouch && getCenterCookie() == null) {
        router.replace("/crm/select");
        return;
      }
      // 선택 화면은 독립 화면 — bootstrap 불필요.
      if (isSelect) return;
      try {
        const token = await getIdToken();
        if (!token) {
          setError("로그인 정보를 확인할 수 없습니다");
          return;
        }
        const res = await fetch("/api/crm/bootstrap", {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data: BootstrapResp = await res.json();
        if (cancelled) return;
        setCtx(data);
        if (isTouch) {
          // 터치출석은 독립 화면 — 온보딩 리다이렉트 대상 아님
        } else if (!data.onboarded && !isOnboarding) {
          router.replace("/crm/onboarding");
        }
        // onboarded 인데 /crm/onboarding 에 있어도 자동으로 튕기지 않음
        // (기존 가입자가 개인 CRM/다른 센터를 추가하러 온보딩에 올 수 있어야 하므로).
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "네트워크 오류");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, user, isOnboarding, isTouch, isSelect, pathname, router, getIdToken]);

  // 1) 로그인 상태 확인 중
  if (loading) {
    return <CrmShell><CenterMessage>불러오는 중…</CenterMessage></CrmShell>;
  }

  // 2) 비로그인
  if (!user) {
    return (
      <CrmShell>
        <CenterMessage>
          <div className="text-[15px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-2">
            CRM은 로그인 후 이용할 수 있습니다
          </div>
          <div className="mt-3 flex flex-col gap-2 w-full max-w-[260px] mx-auto">
            <button
              onClick={() => signInWithGoogle()}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 text-[14px] font-semibold text-zinc-700 dark:text-zinc-200 shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
            >
              <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google로 로그인
            </button>
            <button
              onClick={() => signInWithApple()}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-lg bg-black text-white text-[14px] font-semibold shadow-sm hover:bg-zinc-800 transition-colors"
            >
              <svg className="w-[18px] h-[18px]" viewBox="0 0 384 512" fill="currentColor">
                <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
              </svg>
              Apple로 로그인
            </button>
          </div>
        </CenterMessage>
      </CrmShell>
    );
  }

  // 3) onboarding·터치출석·진입선택 은 사이드바 없이 children 만 렌더 (독립 화면)
  if (isOnboarding || isTouch || isSelect) {
    return <CrmShell>{children}</CrmShell>;
  }

  // 4) 컨텍스트 로드 중
  if (!ctx) {
    return <CrmShell><CenterMessage>{error || "CRM 정보 확인 중…"}</CenterMessage></CrmShell>;
  }

  // 5) 미가입 → onboarding 으로 이동 중
  if (!ctx.onboarded) {
    return <CrmShell><CenterMessage>설정 페이지로 이동합니다…</CenterMessage></CrmShell>;
  }

  // 5-1) 직급권한상 이 센터 CRM 접속 차단됨
  if (ctx.accessDenied) {
    return (
      <CrmShell>
        <CenterMessage>
          <div className="text-[15px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-1.5">
            이 센터 CRM에 접근할 권한이 없어요
          </div>
          <div className="text-[13px] text-[#8C8270] dark:text-zinc-500">
            {ctx.centerName ? `'${ctx.centerName}' ` : ""}관리자에게 문의하시거나, 다른 곳으로 전환해 주세요.
          </div>
          <button
            onClick={() => {
              clearCenterCookie();
              router.replace("/crm/select");
            }}
            className="mt-4 px-4 py-2 rounded-lg bg-[#6B7B3A] text-white text-[14px] font-medium hover:bg-[#5a6932] transition-colors"
          >
            다른 곳으로 전환
          </button>
        </CenterMessage>
      </CrmShell>
    );
  }

  // 6) 정상: 사이드바 + 컨텐츠
  return (
    <CrmShell>
      <div className="flex min-h-[calc(100dvh-3.5rem)]">
        <CrmSidebar
          role={ctx.role ?? "trainer"}
          centerName={ctx.centerName ?? ""}
          centerLogo={ctx.centerLogo ?? null}
          isSoloOwner={ctx.isSoloOwner ?? false}
          centerKind={ctx.centerKind}
          centerMemberId={ctx.centerMemberId ?? null}
          permissions={ctx.permissions}
        />
        <main className="flex-1 min-w-0 md:ml-60">{children}</main>
      </div>
    </CrmShell>
  );
}

function CrmShell({ children }: { children: React.ReactNode }) {
  // CrmThemeProvider 가 화이트/블랙 테마(.dark) 래퍼 + 배경/글자색을 담당.
  return (
    <CrmThemeProvider>
      <CrmToastProvider>{children}</CrmToastProvider>
    </CrmThemeProvider>
  );
}

function CenterMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center min-h-[calc(100dvh-3.5rem)] px-6">
      <div className="text-center text-[14px] text-[#6B5D47] dark:text-zinc-400">
        {children}
      </div>
    </div>
  );
}
