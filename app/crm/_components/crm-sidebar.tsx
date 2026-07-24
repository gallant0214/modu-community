"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";

type Role = "owner" | "admin" | "manager" | "trainer";

interface MenuItem {
  href: string;
  label: string;
  group: "main" | "sales" | "engage" | "admin" | "tools" | "me";
  /** owner / admin 만 보임 (직원관리·설정). manager/trainer 숨김. */
  staffOnly?: boolean;
  /** true 면 새 창(팝업)으로 열기 (터치출석 등 독립 화면). */
  newWindow?: boolean;
  icon: (props: { className?: string }) => React.ReactElement;
}

const MENU: MenuItem[] = [
  { href: "/crm/dashboard",   label: "대시보드",     group: "main", icon: IconDashboard },
  { href: "/crm/members",     label: "회원 관리",     group: "main", icon: IconMembers },
  { href: "/crm/schedule",    label: "스케줄 관리",   group: "main", icon: IconCalendar },
  { href: "/crm/attendances", label: "출석 현황",     group: "main", icon: IconAttendance },
  { href: "/crm/lockers",     label: "락커 관리",     group: "sales", icon: IconLocker },
  { href: "/crm/products",    label: "상품 관리",     group: "sales", icon: IconProduct },
  { href: "/crm/memberships", label: "회원권 관리",   group: "sales", icon: IconMembership },
  { href: "/crm/passes",      label: "수강권 관리",   group: "sales", icon: IconPass },
  { href: "/crm/messages",    label: "메세지 전송",   group: "engage", icon: IconMessage },
  { href: "/crm/stats",       label: "통계",          group: "admin", icon: IconStats },
  { href: "/crm/settings",    label: "센터설정",       group: "admin", staffOnly: true, icon: IconSettings },
  { href: "/crm/touch-attendance", label: "터치출석", group: "tools", staffOnly: true, newWindow: true, icon: IconTouch },
];

/**
 * 개인 강사(kind='solo') 전용 축소 메뉴.
 * 헬스장/센터 관리자용 기능(락커·메세지·통계·센터설정·터치출석)은 숨기고
 * 강사 본인에게 유용한 항목(수업료·내 정보)만 제공.
 */
const SOLO_MENU_HREFS = [
  "/crm/dashboard",
  "/crm/members",
  "/crm/schedule",
  "/crm/attendances",
  "/crm/products",
  "/crm/memberships",
  "/crm/passes",
];

function buildSoloMenu(
  myMemberId: number | null,
  opts: { includeCenterInfo: boolean }
): MenuItem[] {
  const base = MENU.filter((m) => SOLO_MENU_HREFS.includes(m.href));
  base.push({
    href: "/crm/payroll/me",
    label: "내 수업료",
    group: "me",
    icon: IconPayroll,
  });
  if (myMemberId) {
    base.push({
      href: `/crm/staff/${myMemberId}`,
      label: "내 정보",
      group: "me",
      icon: IconSelf,
    });
  }
  // 센터 정보는 본인 센터(=개인 강사) 일 때만. 센터 소속 강사는 접근 권한 없음(403).
  if (opts.includeCenterInfo) {
    base.push({
      href: "/crm/settings?tab=center",
      label: "센터 정보",
      group: "me",
      icon: IconCenter,
    });
  }
  return base;
}

const MENU_GROUPS: MenuItem["group"][] = [
  "main",
  "sales",
  "engage",
  "admin",
  "tools",
  "me",
];

interface Props {
  role: Role;
  centerName: string;
  isSoloOwner: boolean;
  centerKind?: "solo" | "center";
  centerMemberId?: number | null;
}

export function CrmSidebar({ role, centerName, centerKind, centerMemberId }: Props) {
  const pathname = usePathname();
  const { getIdToken } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // 직원관리·설정 메뉴는 owner/admin 만 노출. manager/trainer 는 숨김.
  const isStaffLevel = role === "owner" || role === "admin";

  // 강사 가입 요청 대기 수 → 센터설정 배지. owner/admin 만. 라우트 이동마다 갱신.
  useEffect(() => {
    if (!isStaffLevel) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        const res = await fetch("/api/crm/staff/requests?count=1", {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!res.ok) return;
        const d = await res.json();
        if (!cancelled) setPendingCount(d.count ?? 0);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [isStaffLevel, getIdToken, pathname]);
  // 축소(개인 강사용) 메뉴 대상:
  //  - centerKind='solo' (개인 강사 본인 센터)
  //  - role='trainer' (센터 소속 강사) — 락커/메세지/통계 등 관리 도구 대신 본인 스코프 위주로 표시
  const isSoloMode = centerKind === "solo" || role === "trainer";
  const visible = isSoloMode
    ? buildSoloMenu(centerMemberId ?? null, { includeCenterInfo: centerKind === "solo" })
    : MENU.filter((m) => !m.staffOnly || isStaffLevel);
  const isActive = (href: string) => {
    const clean = href.split("?")[0];
    if (!clean) return false;
    return pathname === clean || pathname?.startsWith(`${clean}/`);
  };

  const links = (
    <>
      {MENU_GROUPS.map((group) => {
        const items = visible.filter((item) => item.group === group);
        if (items.length === 0) return null;
        return (
          <div
            key={group}
            className="space-y-1.5 border-t border-[#E8E0D0]/70 pt-2 mt-2 first:mt-0 first:border-t-0 first:pt-0 dark:border-zinc-800/80"
          >
            {items.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              const cls = `group relative flex h-10 items-center gap-2.5 px-2.5 rounded-lg text-[13.5px] transition-all w-full text-left
                ${active && !item.newWindow
                  ? "bg-[#2F3A2B] text-white shadow-sm dark:bg-[#A8B87A] dark:text-zinc-950 font-semibold"
                  : "text-[#3A342A] hover:bg-[#F5F0E5] dark:text-zinc-300 dark:hover:bg-zinc-800/70"
                }`;
              const iconCls = `flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors
                ${active && !item.newWindow
                  ? "bg-white/14 text-white dark:bg-zinc-950/12 dark:text-zinc-950"
                  : "bg-[#EFE7D5]/70 text-[#6B5D47] group-hover:bg-white dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700"
                }`;
              const body = (
                <>
                  {active && !item.newWindow && (
                    <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r bg-[#D6C38D] dark:bg-zinc-950/50" />
                  )}
                  <span className={iconCls}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.href === "/crm/settings" && pendingCount > 0 && (
                    <span className="inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold leading-none text-white">
                      {pendingCount}
                    </span>
                  )}
                  {item.newWindow && (
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none bg-[#EFE7D5] text-[#8C8270] dark:bg-zinc-800 dark:text-zinc-500">
                      새창
                    </span>
                  )}
                </>
              );
              if (item.newWindow) {
                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => {
                      window.open(item.href, "_blank", "noopener,noreferrer,width=480,height=760");
                      setMobileOpen(false);
                    }}
                    className={cls}
                  >
                    {body}
                  </button>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cls}
                >
                  {body}
                </Link>
              );
            })}
          </div>
        );
      })}
    </>
  );

  return (
    <>
      {/* 모바일 상단 바 (햄버거) */}
      <div className="md:hidden sticky top-0 z-30 flex items-center gap-2 px-4 h-12 border-b border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7]/95 dark:bg-zinc-950/95 backdrop-blur">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="메뉴 열기"
          className="p-1.5 -ml-1.5 rounded-md hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
        >
          <svg className="w-5 h-5 text-[#3A342A] dark:text-zinc-200" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 truncate">
          {centerName || "CRM"}
        </span>
      </div>

      {/* 데스크탑 사이드바 — navbar(56px) 아래 완전 고정(fixed). 스크롤·overflow 무관하게 항상 고정 */}
      <aside className="hidden md:flex flex-col w-60 border-r border-[#E1D5C0] dark:border-zinc-800 bg-[#FBF7EB]/82 dark:bg-zinc-950/88 backdrop-blur fixed top-14 left-0 z-30 h-[calc(100dvh-3.5rem)]">
        <SidebarHeader centerName={centerName} />
        <nav className="flex-1 min-h-0 overflow-y-auto px-3 pt-2 pb-3">{links}</nav>
        <SidebarFooter />
      </aside>

      {/* 모바일 슬라이드 사이드바 */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-72 flex flex-col bg-[#FEFCF7] dark:bg-zinc-950 border-r border-[#E1D5C0] dark:border-zinc-800 shadow-xl">
            <SidebarHeader centerName={centerName} />
            <nav className="flex-1 px-3 pt-2 pb-3 overflow-y-auto">{links}</nav>
            <SidebarFooter />
          </aside>
        </div>
      )}
    </>
  );
}

function SidebarHeader({ centerName }: { centerName: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const initial = (centerName || "C").trim().slice(0, 1).toUpperCase();
  const storageKey = `crm-sidebar-logo:${centerName || "default"}`;
  const [logoSrc, setLogoSrc] = useState(() => {
    if (typeof window === "undefined") return "/logo.png";
    try {
      return localStorage.getItem(storageKey) || "/logo.png";
    } catch {
      return "/logo.png";
    }
  });
  const [logoBroken, setLogoBroken] = useState(false);
  const [pendingLogoSrc, setPendingLogoSrc] = useState("");
  const [logoScale, setLogoScale] = useState(100);

  const handleLogoFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const next = String(reader.result ?? "");
      if (!next) return;
      setPendingLogoSrc(next);
      setLogoScale(100);
    };
    reader.readAsDataURL(file);
  };

  const saveEditedLogo = () => {
    if (!pendingLogoSrc) return;
    const img = new Image();
    img.onload = () => {
      const size = 192;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      const base = Math.min(size / img.width, size / img.height);
      const scale = base * (logoScale / 100);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const x = (size - drawW) / 2;
      const y = (size - drawH) / 2;
      ctx.drawImage(img, x, y, drawW, drawH);

      const next = canvas.toDataURL("image/png");
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        window.alert("이미지 용량이 커서 저장할 수 없어요. 더 작은 로고 이미지를 선택해주세요.");
        return;
      }
      setLogoSrc(next);
      setLogoBroken(false);
      setPendingLogoSrc("");
    };
    img.src = pendingLogoSrc;
  };

  const resetLogo = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    setLogoSrc("/logo.png");
    setLogoBroken(false);
    setPendingLogoSrc("");
  };

  return (
    <div className="shrink-0 px-4 py-3 border-b border-[#E1D5C0] dark:border-zinc-800">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="group relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#E4D9C6] bg-white shadow-sm transition-colors hover:border-[#6B7B3A]/50 dark:border-zinc-800 dark:bg-zinc-900"
          aria-label="사이드바 로고 이미지 변경"
        >
          {!logoBroken && logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoSrc}
              alt=""
              className="h-7 w-7 rounded-md object-contain"
              onError={() => setLogoBroken(true)}
            />
          ) : (
            <span className="text-[14px] font-bold text-[#2F3A2B] dark:text-[#A8B87A]">
              {initial}
            </span>
          )}
          <span className="absolute inset-0 hidden items-center justify-center bg-[#2F3A2B]/82 px-1 text-center text-[10px] font-bold leading-tight text-white group-hover:flex dark:bg-zinc-950/82">
            로고 변경
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            handleLogoFile(event.target.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
        {pendingLogoSrc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
            <div className="w-full max-w-sm rounded-xl border border-[#E4D9C6] bg-[#FEFCF7] p-4 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100">
                    로고 이미지 편집
                  </h2>
                  <p className="mt-1 text-[12px] text-[#8C8270] dark:text-zinc-500">
                    사이드바 로고 영역에 맞게 크기를 조절하세요.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingLogoSrc("")}
                  className="rounded-md px-2 py-1 text-[12px] font-semibold text-[#8C8270] hover:bg-[#F5F0E5] dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  닫기
                </button>
              </div>

              <div className="mt-4 flex justify-center">
                <div className="relative flex h-44 w-44 items-center justify-center overflow-hidden rounded-2xl border border-[#D9CDB8] bg-white shadow-inner dark:border-zinc-700 dark:bg-zinc-900">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pendingLogoSrc}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                    style={{ transform: `scale(${logoScale / 100})` }}
                  />
                  <div className="pointer-events-none absolute inset-4 rounded-xl border border-dashed border-[#B7A98E] dark:border-zinc-600" />
                </div>
              </div>

              <label className="mt-4 block">
                <div className="mb-1.5 flex items-center justify-between text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-400">
                  <span>로고 크기</span>
                  <span>{logoScale}%</span>
                </div>
                <input
                  type="range"
                  min={45}
                  max={180}
                  value={logoScale}
                  onChange={(event) => setLogoScale(Number(event.target.value))}
                  className="w-full accent-[#6B7B3A]"
                />
              </label>

              <div className="mt-4 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={resetLogo}
                  className="rounded-lg border border-[#D9CDB8] px-3 py-2 text-[12.5px] font-semibold text-[#6B5D47] hover:bg-[#F5F0E5] dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  기본 로고
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingLogoSrc("")}
                    className="rounded-lg border border-[#D9CDB8] px-3 py-2 text-[12.5px] font-semibold text-[#6B5D47] hover:bg-[#F5F0E5] dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={saveEditedLogo}
                    className="rounded-lg bg-[#2F3A2B] px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-[#263121] dark:bg-[#A8B87A] dark:text-zinc-950"
                  >
                    적용
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="min-w-0">
          <div className="text-[10.5px] text-[#A89B80] dark:text-zinc-500 font-semibold leading-none">
            CENTER
          </div>
          <div className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 truncate leading-tight mt-1">
            {centerName || "CRM"}
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarFooter() {
  return (
    <div className="px-3 py-3 border-t border-[#E1D5C0] dark:border-zinc-800">
      <Link
        href="/"
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800/60"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        커뮤니티로 돌아가기
      </Link>
    </div>
  );
}

/* ── 아이콘 (inline SVG, 외부 패키지 의존 안 함) ── */
function IconDashboard({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}
function IconMembers({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}
function IconPass({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
    </svg>
  );
}
function IconCalendar({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}
function IconStats({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l-2 2m12 11V10m-4 9V14m-8 5H4" />
    </svg>
  );
}
function IconSettings({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
function IconLocker({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16M9 9h.5M9 13h.5M15 9h-.5M15 13h-.5" />
    </svg>
  );
}
function IconMembership({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h4" />
    </svg>
  );
}
function IconProduct({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0v10l-8 4m8-14l-8 4m0 0L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}
function IconTouch({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 11V6a2 2 0 114 0v5m0 0V4a2 2 0 114 0v7m0 0V9a2 2 0 114 0v6a6 6 0 01-6 6h-2.5a5 5 0 01-4-2l-3.5-4.5a2 2 0 013-2.5L9 15V11z" />
    </svg>
  );
}
function IconMessage({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}
function IconAttendance({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M8 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2h-3M8 3v4h8V3M8 3h8" />
    </svg>
  );
}
function IconPayroll({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 10v-2m0 2c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function IconSelf({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function IconCenter({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M4 10l8-6 8 6M6 10v11M18 10v11M10 21v-6h4v6" />
    </svg>
  );
}
