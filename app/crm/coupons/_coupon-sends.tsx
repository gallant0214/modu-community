"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { EmptyBox, authedFetch, dangerBtn, formatDateTime, ghostBtn } from "./_shared";

interface SendRow {
  id: number;
  coupon_id: number;
  coupon_name: string;
  benefit: string;
  channel: "push" | "sms" | "both" | "none";
  message: string | null;
  recipient_count: number;
  skipped_count: number;
  sms_sent: number;
  sms_failed: number;
  audience_kind: string | null;
  sent_by_name: string | null;
  created_at: string;
  usage: { used: number; revoked: number; expired: number; available: number };
}

const CHANNEL_LABEL = { push: "앱 알림", sms: "문자", both: "앱 알림 + 문자", none: "알림 없이 발급" };
const AUDIENCE_LABEL: Record<string, string> = {
  all: "전체 회원",
  active: "유효 회원",
  dormant: "장기 미출석",
  expiring: "만료 임박",
  expired: "만료 회원",
  unassigned: "미가입 회원",
  individual: "개별 선택",
};

/** 발송 기록 — 발송 단위로 결과·사용 현황을 보고, 잘못 보낸 발송은 안 쓴 쿠폰을 한 번에 회수 */
export function CouponSendsTab({
  canManage,
  refreshKey,
  onOpenIssues,
}: {
  canManage: boolean;
  refreshKey: number;
  onOpenIssues: (sendId: number) => void;
}) {
  const { getIdToken } = useAuth();
  const [rows, setRows] = useState<SendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openMsg, setOpenMsg] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authedFetch(getIdToken, "/api/crm/coupons/sends");
      if (!r.ok) setError(String(r.data.error ?? "불러오지 못했어요"));
      else setRows((r.data.sends as SendRow[]) ?? []);
    } catch {
      setError("네트워크 오류로 불러오지 못했어요");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);
  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const revokeAll = async (s: SendRow) => {
    if (s.usage.available === 0) return alert("회수할 쿠폰이 없어요 (모두 사용·회수·만료됨).");
    const reason = prompt(
      `이 발송의 안 쓴 쿠폰 ${s.usage.available}장을 모두 회수할까요?\n이미 사용된 ${s.usage.used}장은 그대로 둡니다.\n\n회수 사유(선택)`,
      "잘못 발송"
    );
    if (reason === null) return;
    const r = await authedFetch(getIdToken, `/api/crm/coupons/sends/${s.id}`, {
      method: "POST",
      body: JSON.stringify({ action: "revoke_unused", reason }),
    });
    if (!r.ok) return alert(String(r.data.error ?? "회수 실패"));
    alert(`${r.data.revoked}장을 회수했어요.`);
    load();
  };

  if (error) return <EmptyBox>{error}</EmptyBox>;
  if (loading && rows.length === 0) return <div className="py-10 text-center text-[13px] text-[#8C8270]">불러오는 중…</div>;
  if (rows.length === 0) return <EmptyBox>아직 발송한 쿠폰이 없어요.</EmptyBox>;

  return (
    <ul className="space-y-2.5">
      {rows.map((s) => {
        const total = Math.max(1, s.recipient_count);
        const seg = [
          { k: "사용", n: s.usage.used, cls: "bg-[#5c8a1e] dark:bg-[#6ea023]" },
          { k: "보유", n: s.usage.available, cls: "bg-[#5c8a1e]/30 dark:bg-[#6ea023]/30" },
          { k: "회수·만료", n: s.usage.revoked + s.usage.expired, cls: "bg-[#D9D2C4] dark:bg-zinc-700" },
        ];
        return (
          <li key={s.id} className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[14px] font-bold text-[#2A251D] dark:text-zinc-100">{s.coupon_name}</span>
              <span className="text-[12.5px] font-semibold text-[#4d5a29] dark:text-[#A8B87A]">{s.benefit}</span>
              <span className="ml-auto text-[11.5px] text-[#8C8270] dark:text-zinc-500">{formatDateTime(s.created_at)}</span>
            </div>
            <div className="mt-1 text-[12px] text-[#6B5D47] dark:text-zinc-400">
              {AUDIENCE_LABEL[s.audience_kind ?? ""] ?? "-"} · {CHANNEL_LABEL[s.channel]} · 발급 <b>{s.recipient_count.toLocaleString()}</b>명
              {s.skipped_count > 0 && <span className="text-[#A89B80]"> (1인 1장 제외 {s.skipped_count})</span>}
              {(s.channel === "sms" || s.channel === "both") && (
                <span> · 문자 성공 {s.sms_sent}{s.sms_failed > 0 && <span className="text-[#B4442A]"> / 실패 {s.sms_failed}</span>}</span>
              )}
              {s.sent_by_name && <span className="text-[#A89B80]"> · {s.sent_by_name}</span>}
            </div>

            {/* 이 발송분이 지금 어떻게 됐는지 — 사용/보유/회수·만료 */}
            <div className="mt-2 flex h-2 rounded-full overflow-hidden bg-[#EFE7D5] dark:bg-zinc-800" role="img"
                 aria-label={`사용 ${s.usage.used}, 보유 ${s.usage.available}, 회수·만료 ${s.usage.revoked + s.usage.expired}`}>
              {seg.map((g) =>
                g.n > 0 ? <div key={g.k} className={`${g.cls} h-full`} style={{ width: `${(g.n / total) * 100}%`, marginRight: 2 }} /> : null
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-[11.5px] text-[#6B5D47] dark:text-zinc-400">
              {seg.map((g) => (
                <span key={g.k} className="inline-flex items-center gap-1">
                  <i className={`w-2 h-2 rounded-full ${g.cls}`} />
                  {g.k} {g.n}
                </span>
              ))}
              <span className="ml-auto font-semibold">사용률 {Math.round((s.usage.used / total) * 100)}%</span>
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <button type="button" className={ghostBtn} onClick={() => onOpenIssues(s.id)}>받은 회원 보기</button>
              {s.message && (
                <button type="button" className={ghostBtn} onClick={() => setOpenMsg(openMsg === s.id ? null : s.id)}>
                  {openMsg === s.id ? "문구 접기" : "보낸 문구"}
                </button>
              )}
              {canManage && s.usage.available > 0 && (
                <button type="button" className={dangerBtn} onClick={() => revokeAll(s)}>
                  안 쓴 쿠폰 {s.usage.available}장 회수
                </button>
              )}
            </div>
            {openMsg === s.id && s.message && (
              <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-[#FBF7EB] dark:bg-zinc-800/60 px-3 py-2 text-[12.5px] text-[#3A342A] dark:text-zinc-200 font-sans">
                {s.message}
              </pre>
            )}
          </li>
        );
      })}
    </ul>
  );
}
