"use client";

import { useEffect, useState } from "react";
import { smsAllowedForCenter } from "@/app/lib/crm-sms-availability";
import { useAuth } from "@/app/components/auth-provider";
import { CouponListTab } from "./_coupon-list";
import { CouponSendTab } from "./_coupon-send";
import { CouponSendsTab } from "./_coupon-sends";
import { CouponIssuesTab } from "./_coupon-issues";
import { EmptyBox } from "./_shared";

type Tab = "coupons" | "send" | "sends" | "usage" | "issues";

const TABS: { key: Tab; label: string; perm: "view" | "send" }[] = [
  { key: "coupons", label: "쿠폰", perm: "view" },
  { key: "send", label: "쿠폰 발송", perm: "send" },
  { key: "sends", label: "발송 기록", perm: "view" },
  { key: "usage", label: "사용 이력", perm: "view" },
  { key: "issues", label: "발급 내역·회수", perm: "view" },
];

export default function CrmCouponsPage() {
  const { getIdToken } = useAuth();
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "coupons";
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    return t && TABS.some((x) => x.key === t) ? t : "coupons";
  });
  const [perms, setPerms] = useState<{ view: boolean; send: boolean; manage: boolean } | null>(null);
  const [centerName, setCenterName] = useState("");
  const [centerId, setCenterId] = useState<number | null>(null);
  // 탭 간 이동 시 넘겨주는 필터
  const [sendCouponId, setSendCouponId] = useState<number | null>(null);
  const [issuesCouponId, setIssuesCouponId] = useState<number | null>(null);
  const [issuesSendId, setIssuesSendId] = useState<number | null>(null);
  // 발송 후 다른 탭이 새로 불러오도록
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch("/api/crm/bootstrap", {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const d = await res.json();
        const p = (d?.permissions ?? {}) as Record<string, boolean>;
        setPerms({
          view: p["coupons.view"] !== false,
          send: p["coupons.send"] !== false,
          manage: p["coupons.manage"] !== false,
        });
        setCenterName(String(d?.centerName ?? ""));
        setCenterId(typeof d?.centerId === "number" ? d.centerId : null);
      } catch {
        setPerms({ view: true, send: true, manage: true });
      }
    })();
  }, [getIdToken]);

  // 탭을 URL 에 반영 (새로고침·뒤로가기 시 같은 탭 유지)
  const go = (t: Tab) => {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url.toString());
  };

  const visibleTabs = TABS.filter((t) => !perms || perms[t.perm]);

  return (
    <div className="px-5 md:px-8 pt-2 pb-8 md:pt-3 max-w-5xl mx-auto">
      <header className="mb-4">
        <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">쿠폰</h1>
        <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
          쿠폰을 만들어 회원에게 보내고, 결제할 때 회원 상세의 발급창에서 적용해요.
        </p>
      </header>

      {perms && !perms.view && !perms.send ? (
        <EmptyBox>
          쿠폰 권한이 없습니다. 센터 관리자에게 문의해 주세요.
          <div className="mt-1 text-[12px] text-[#A89B80]">(센터설정 → 직급 권한 → 쿠폰에서 부여할 수 있어요)</div>
        </EmptyBox>
      ) : (
        <>
          <div className="mb-5 flex gap-1 border-b border-[#E8E0D0] dark:border-zinc-800 overflow-x-auto">
            {visibleTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => go(t.key)}
                className={`shrink-0 px-3.5 py-2 -mb-px text-[13.5px] font-semibold border-b-2 transition-colors ${
                  tab === t.key
                    ? "border-[#6B7B3A] text-[#3A342A] dark:text-zinc-100"
                    : "border-transparent text-[#8C8270] dark:text-zinc-500 hover:text-[#3A342A] dark:hover:text-zinc-300"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "coupons" && (
            <CouponListTab
              canManage={!!perms?.manage}
              refreshKey={refreshKey}
              onSend={(id) => {
                setSendCouponId(id);
                go("send");
              }}
              onOpenIssues={(id) => {
                setIssuesCouponId(id);
                setIssuesSendId(null);
                go("issues");
              }}
            />
          )}
          {tab === "send" && (
            <CouponSendTab
              centerName={centerName}
              smsAllowed={smsAllowedForCenter(centerId)}
              initialCouponId={sendCouponId}
              onSent={() => setRefreshKey((k) => k + 1)}
            />
          )}
          {tab === "sends" && (
            <CouponSendsTab
              canManage={!!perms?.manage}
              refreshKey={refreshKey}
              onOpenIssues={(sendId) => {
                setIssuesSendId(sendId);
                setIssuesCouponId(null);
                go("issues");
              }}
            />
          )}
          {tab === "usage" && <CouponIssuesTab mode="usage" canManage={!!perms?.manage} refreshKey={refreshKey} />}
          {tab === "issues" && (
            <CouponIssuesTab
              mode="all"
              canManage={!!perms?.manage}
              refreshKey={refreshKey}
              presetCouponId={issuesCouponId}
              presetSendId={issuesSendId}
              onClearPreset={() => {
                setIssuesSendId(null);
                setIssuesCouponId(null);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
