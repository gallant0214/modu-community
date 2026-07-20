"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Role = "owner" | "admin" | "manager" | "trainer";

interface MenuItem {
  href: string;
  label: string;
  /** owner / admin 만 보임 (직원관리·설정). manager/trainer 숨김. */
  staffOnly?: boolean;
  icon: (props: { className?: string }) => React.ReactElement;
}

const MENU: MenuItem[] = [
  { href: "/crm/dashboard",   label: "대시보드",     icon: IconDashboard },
  { href: "/crm/members",     label: "회원 관리",     icon: IconMembers },
  { href: "/crm/products",    label: "상품 관리",     icon: IconProduct },
  { href: "/crm/lockers",     label: "락커 관리",     icon: IconLocker },
  { href: "/crm/schedule",    label: "스케줄 관리",   icon: IconCalendar },
  { href: "/crm/kiosk",       label: "출석 체크",     icon: IconKiosk },
  { href: "/crm/attendances", label: "출석 현황",     icon: IconAttendance },
  { href: "/crm/messages",    label: "메세지 전송",   icon: IconMessage },
  { href: "/crm/contracts",   label: "전자계약서",     icon: IconContract },
  { href: "/crm/passes",      label: "수강권 관리",   icon: IconPass },
  { href: "/crm/memberships", label: "회원권 관리",   icon: IconMembership },
  { href: "/crm/staff",       label: "직원 관리",     staffOnly: true, icon: IconStaff },
  { href: "/crm/payroll",     label: "직원 급여",     staffOnly: true, icon: IconPayroll },
  { href: "/crm/stats",       label: "통계",          icon: IconStats },
  { href: "/crm/settings",    label: "센터설정",       staffOnly: true, icon: IconSettings },
];

interface Props {
  role: Role;
  centerName: string;
  isSoloOwner: boolean;
}

export function CrmSidebar({ role, centerName, isSoloOwner: _isSoloOwner }: Props) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // 직원관리·설정 메뉴는 owner/admin 만 노출. manager/trainer 는 숨김.
  const isStaffLevel = role === "owner" || role === "admin";
  const visible = MENU.filter((m) => !m.staffOnly || isStaffLevel);

  const links = (
    <>
      {visible.map((item) => {
        const active = pathname?.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] transition-colors
              ${active
                ? "bg-[#6B7B3A]/10 text-[#6B7B3A] dark:bg-[#6B7B3A]/20 dark:text-[#A8B87A] font-semibold"
                : "text-[#3A342A] hover:bg-[#F5F0E5] dark:text-zinc-300 dark:hover:bg-zinc-800/60"
              }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span>{item.label}</span>
          </Link>
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
      <aside className="hidden md:flex flex-col w-60 border-r border-[#E8E0D0] dark:border-zinc-800 bg-[#FBF7EB]/40 dark:bg-zinc-900/40 fixed top-14 left-0 z-30 h-[calc(100dvh-3.5rem)]">
        <SidebarHeader centerName={centerName} />
        <nav className="flex-1 min-h-0 overflow-y-auto px-3 pt-1.5 pb-2 space-y-1">{links}</nav>
        <SidebarFooter />
      </aside>

      {/* 모바일 슬라이드 사이드바 */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-72 flex flex-col bg-[#FEFCF7] dark:bg-zinc-950 border-r border-[#E8E0D0] dark:border-zinc-800 shadow-xl">
            <SidebarHeader centerName={centerName} />
            <nav className="flex-1 px-3 pt-1.5 pb-2 space-y-1 overflow-y-auto">{links}</nav>
            <SidebarFooter />
          </aside>
        </div>
      )}
    </>
  );
}

function SidebarHeader({ centerName }: { centerName: string }) {
  return (
    <div className="shrink-0 px-4 py-1.5 border-b border-[#E8E0D0] dark:border-zinc-800">
      <div className="text-[10.5px] text-[#A89B80] dark:text-zinc-500 font-medium leading-none">
        센터명
      </div>
      <div className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 truncate leading-none mt-1">
        {centerName || "CRM"}
      </div>
    </div>
  );
}

function SidebarFooter() {
  return (
    <div className="px-3 py-3 border-t border-[#E8E0D0] dark:border-zinc-800">
      <Link
        href="/"
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800/60"
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
function IconStaff({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}
function IconMembers({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
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
function IconContract({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h6l5 5v11a2 2 0 01-2 2z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 3v5h5" />
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
function IconKiosk({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-7a2 2 0 00-2-2H6a2 2 0 00-2 2v7a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
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
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
