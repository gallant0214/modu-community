"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/app/components/auth-provider";
import { CrmSidebar } from "./_components/crm-sidebar";
import { CrmThemeProvider } from "./_components/crm-theme";
import { CrmToastProvider } from "./_components/crm-toast";

type Role = "owner" | "admin" | "manager" | "trainer";

interface BootstrapResp {
  onboarded: boolean;
  centerId?: number;
  centerMemberId?: number | null;
  centerName?: string;
  centerKind?: "solo" | "center";
  role?: Role;
  accessLevel?: "admin" | "schedule" | "none";
  isSoloOwner?: boolean;
}

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, getIdToken, signInWithGoogle } = useAuth();
  const [ctx, setCtx] = useState<BootstrapResp | null>(null);
  const [error, setError] = useState("");

  const isOnboarding = pathname === "/crm/onboarding";
  const isTouch = pathname === "/crm/touch-attendance";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (loading || !user) return;
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
        } else if (data.onboarded && isOnboarding) {
          router.replace("/crm/dashboard");
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "네트워크 오류");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, user, isOnboarding, isTouch, pathname, router, getIdToken]);

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

  // 3) onboarding·터치출석 은 사이드바 없이 children 만 렌더 (독립 화면)
  if (isOnboarding || isTouch) {
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
