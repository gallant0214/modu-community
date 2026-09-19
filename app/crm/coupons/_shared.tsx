"use client";

import type { IssueStatus } from "@/app/lib/crm-coupons";

/** 메세지 전송 화면과 같은 섹션 카드 */
export function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 px-4 py-4 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">{title}</h2>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </section>
  );
}

export function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="text-[12.5px] font-medium text-[#6B5D47] dark:text-zinc-400 mb-1.5 mt-2">
      {children}
      {hint && <span className="ml-1.5 text-[11.5px] font-normal text-[#A89B80]">{hint}</span>}
    </div>
  );
}

export function EmptyBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-8 text-center text-[13px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
      {children}
    </div>
  );
}

/** 상태 배지 — 색만으로 구분하지 않도록 항상 글자 포함 */
const STATUS_STYLE: Record<IssueStatus, string> = {
  issued: "bg-[#6B7B3A]/12 text-[#4d5a29] dark:bg-[#6B7B3A]/25 dark:text-[#C3D19A]",
  used: "bg-[#2a78d6]/10 text-[#1c5cab] dark:bg-[#3987e5]/20 dark:text-[#9ec5f4]",
  revoked: "bg-[#B4442A]/10 text-[#B4442A] dark:bg-red-500/15 dark:text-red-300",
  expired: "bg-[#8C8270]/12 text-[#6B5D47] dark:bg-zinc-700/60 dark:text-zinc-400",
};
const STATUS_TEXT: Record<IssueStatus, string> = {
  issued: "사용 가능",
  used: "사용 완료",
  revoked: "회수됨",
  expired: "기간 만료",
};
export function StatusBadge({ status }: { status: IssueStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[status]}`}>
      {STATUS_TEXT[status]}
    </span>
  );
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  try {
    const k = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
  } catch {
    return iso;
  }
}

export function formatYmd(ymd: string | null | undefined): string {
  return ymd ? ymd.replace(/-/g, ".") : "-";
}

export const won = (n: number | null | undefined) => `${Math.round(n ?? 0).toLocaleString()}원`;

export const primaryBtn =
  "px-3.5 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932] disabled:opacity-50";
export const ghostBtn =
  "px-3 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12.5px] font-semibold text-[#6B5D47] dark:text-zinc-300 bg-[#FEFCF7] dark:bg-zinc-900 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 disabled:opacity-50";
export const dangerBtn =
  "px-3 py-1.5 rounded-lg border border-[#B4442A]/40 text-[12.5px] font-semibold text-[#B4442A] dark:text-red-300 hover:bg-[#B4442A]/5 disabled:opacity-50";

/** 인증 헤더를 붙인 fetch */
export async function authedFetch(
  getIdToken: () => Promise<string | null>,
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const token = await getIdToken();
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      authorization: `Bearer ${token ?? ""}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}
