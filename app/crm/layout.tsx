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
  role?: Role;
  accessLevel?: "admin" | "schedule" | "none";
  isSoloOwner?: boolean;
  permissions?: Record<string, boolean>;
}

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, getIdToken, signInWithGoogle } = useAuth();
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
          <button
            onClick={() => signInWithGoogle()}
            className="mt-3 px-4 py-2 rounded-lg bg-[#6B7B3A] text-white text-[14px] font-medium hover:bg-[#5a6932] transition-colors"
          >
            Google로 로그인
          </button>
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
