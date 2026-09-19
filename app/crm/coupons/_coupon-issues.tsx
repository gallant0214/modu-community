"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { crmInputClass } from "../_components/crm-modal";
import { formatPhone } from "../_components/crm-labels";
import type { IssueStatus } from "@/app/lib/crm-coupons";
import type { CouponRow } from "./_coupon-list";
import {
  EmptyBox,
  StatusBadge,
  authedFetch,
  dangerBtn,
  formatDateTime,
  formatYmd,
  ghostBtn,
  won,
} from "./_shared";

interface IssueRow {
  id: number;
  code: string;
  couponId: number;
  couponName: string;
  benefit: string;
  memberId: number;
  memberName: string;
  memberPhone: string | null;
  sendId: number | null;
  status: IssueStatus;
  issuedAt: string;
  expiresAt: string | null;
  usedAt: string | null;
  usedByName: string | null;
  usedFor: string | null;
  originalPriceWon: number | null;
  discountWon: number | null;
  revokedAt: string | null;
  revokedByName: string | null;
  revokeReason: string | null;
}

const STATUS_FILTERS: { key: "all" | IssueStatus; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "issued", label: "사용 가능" },
  { key: "used", label: "사용 완료" },
  { key: "revoked", label: "회수됨" },
  { key: "expired", label: "기간 만료" },
];

/**
 * 쿠폰 내역 — 회원별로 발급된 쿠폰 한 장 한 장.
 *   mode="usage" : 사용 이력(사용 완료 + 기간 필터 + 할인 합계)
 *   mode="all"   : 발급 내역(상태별 조회 + 개별 회수/회수 취소/사용 취소)
 */
export function CouponIssuesTab({
  mode,
  canManage,
  refreshKey,
  presetCouponId,
  presetSendId,
  onClearPreset,
}: {
  mode: "usage" | "all";
  canManage: boolean;
  refreshKey: number;
  presetCouponId?: number | null;
  presetSendId?: number | null;
  onClearPreset?: () => void;
}) {
  const { getIdToken } = useAuth();
  const [status, setStatus] = useState<"all" | IssueStatus>(
    mode === "usage" ? "used" : "all",
  );
  const [couponId, setCouponId] = useState<number | "">(presetCouponId ?? "");
  const [q, setQ] = useState("");
  const [qApplied, setQApplied] = useState("");
  // 사용 이력 기본 기간 = 이번 달 1일부터 (KST)
  const [from, setFrom] = useState(() =>
    mode === "usage"
      ? new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 8) + "01"
      : "",
  );
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<IssueRow[]>([]);
  const [discountTotal, setDiscountTotal] = useState(0);
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    setCouponId(presetCouponId ?? "");
  }, [presetCouponId]);

  useEffect(() => {
    (async () => {
      const r = await authedFetch(getIdToken, "/api/crm/coupons?status=all");
      setCoupons((r.data.coupons as CouponRow[]) ?? []);
    })();
  }, [getIdToken, refreshKey]);

  // 검색어 디바운스
  useEffect(() => {
    const t = setTimeout(() => setQApplied(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const sp = new URLSearchParams({ status });
      if (couponId) sp.set("coupon_id", String(couponId));
      if (presetSendId) sp.set("send_id", String(presetSendId));
      if (qApplied) sp.set("q", qApplied);
      if (status === "used" && from) sp.set("from", from);
      if (status === "used" && to) sp.set("to", to);
      const r = await authedFetch(getIdToken, `/api/crm/coupons/issues?${sp}`);
      if (!r.ok) setError(String(r.data.error ?? "불러오지 못했어요"));
      else {
        setRows((r.data.issues as IssueRow[]) ?? []);
        setDiscountTotal(Number(r.data.discountTotal ?? 0));
      }
    } catch {
      setError("네트워크 오류로 불러오지 못했어요");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, status, couponId, presetSendId, qApplied, from, to]);
  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const act = async (row: IssueRow, action: "revoke" | "restore" | "unuse") => {
    const msg = {
      revoke: `${row.memberName} 회원의 '${row.couponName}' 쿠폰을 회수할까요?\n\n회수 사유(선택)`,
      restore: `회수한 쿠폰을 다시 쓸 수 있게 돌려줄까요?`,
      unuse: `사용 처리를 취소하고 쿠폰을 돌려줄까요?\n(결제 금액·발급된 상품은 바뀌지 않아요. 환불은 결제내역에서 따로 처리해 주세요)`,
    }[action];
    let reason: string | null = "";
    if (action === "revoke") {
      reason = prompt(msg, "");
      if (reason === null) return;
    } else if (!confirm(msg)) return;
    setBusy(row.id);
    const r = await authedFetch(
      getIdToken,
      `/api/crm/coupons/issues/${row.id}`,
      {
        method: "POST",
        body: JSON.stringify({ action, reason }),
      },
    );
    setBusy(null);
    if (!r.ok) return alert(String(r.data.error ?? "처리 실패"));
    load();
  };

  // 엑셀에서 바로 열리는 CSV (BOM 포함)
  const downloadCsv = () => {
    const header = [
      "쿠폰",
      "혜택",
      "코드",
      "회원",
      "연락처",
      "상태",
      "발급일",
      "만료일",
      "사용일",
      "사용처",
      "정가",
      "할인액",
      "처리 직원",
      "회수일",
      "회수 사유",
    ];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = rows.map((r) =>
      [
        r.couponName,
        r.benefit,
        r.code,
        r.memberName,
        r.memberPhone ? formatPhone(r.memberPhone) : "",
        {
          issued: "사용 가능",
          used: "사용 완료",
          revoked: "회수됨",
          expired: "기간 만료",
        }[r.status],
        formatDateTime(r.issuedAt),
        r.expiresAt ?? "",
        r.usedAt ? formatDateTime(r.usedAt) : "",
        r.usedFor ?? "",
        r.originalPriceWon ?? "",
        r.discountWon ?? "",
        r.usedByName ?? "",
        r.revokedAt ? formatDateTime(r.revokedAt) : "",
        r.revokeReason ?? "",
      ]
        .map(esc)
        .join(","),
    );
    const blob = new Blob(
      ["﻿" + [header.map(esc).join(","), ...lines].join("\n")],
      { type: "text/csv;charset=utf-8" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `쿠폰_${mode === "usage" ? "사용이력" : "발급내역"}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      {presetSendId && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-[#5A8BB0]/[0.08] border border-[#5A8BB0]/30 px-3 py-2 text-[12.5px] text-[#3A342A] dark:text-zinc-200">
          특정 발송 건에서 받은 회원만 보고 있어요.
          <button
            type="button"
            className="ml-auto underline text-[#5A8BB0]"
            onClick={onClearPreset}
          >
            전체 보기
          </button>
        </div>
      )}

      {/* 필터 한 줄 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {mode === "all" && (
          <div className="inline-flex rounded-lg border border-[#E8E0D0] dark:border-zinc-700 overflow-hidden">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatus(f.key)}
                className={`px-2.5 py-1.5 text-[12px] font-semibold ${status === f.key ? "bg-[#6B7B3A] text-white" : "bg-[#FEFCF7] dark:bg-zinc-900 text-[#6B5D47] dark:text-zinc-300"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
        <select
          className={`${crmInputClass} !w-auto`}
          value={couponId}
          onChange={(e) =>
            setCouponId(e.target.value ? Number(e.target.value) : "")
          }
        >
          <option value="">모든 쿠폰</option>
          {coupons.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.status === "archived" ? " (보관)" : ""}
            </option>
          ))}
        </select>
        {status === "used" && (
          <span className="inline-flex items-center gap-1">
            <input
              type="date"
              className={`${crmInputClass} !w-auto`}
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
            <span className="text-[12px] text-[#A89B80]">~</span>
            <input
              type="date"
              className={`${crmInputClass} !w-auto`}
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </span>
        )}
        <input
          className={`${crmInputClass} !w-48`}
          placeholder="이름·연락처·쿠폰코드"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          type="button"
          className={`${ghostBtn} ml-auto`}
          onClick={downloadCsv}
          disabled={rows.length === 0}
        >
          엑셀(CSV) 받기
        </button>
      </div>

      <div className="mb-2 text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
        {rows.length.toLocaleString()}건
        {status === "used" && discountTotal > 0 && (
          <span>
            {" "}
            · 할인 합계{" "}
            <b className="text-[#2A251D] dark:text-zinc-100">
              {won(discountTotal)}
            </b>
          </span>
        )}
      </div>

      {error ? (
        <EmptyBox>{error}</EmptyBox>
      ) : loading && rows.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-[#8C8270]">
          불러오는 중…
        </div>
      ) : rows.length === 0 ? (
        <EmptyBox>
          {status === "used"
            ? "이 기간에 사용된 쿠폰이 없어요."
            : "조건에 맞는 쿠폰이 없어요."}
        </EmptyBox>
      ) : (
        <div className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 overflow-x-auto">
          <table className="w-full min-w-[760px] text-[12.5px]">
            <thead className="bg-[#FBF7EB]/70 dark:bg-zinc-900/70 text-[#6B5D47] dark:text-zinc-400">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold">회원</th>
                <th className="px-3 py-2 font-semibold">쿠폰</th>
                <th className="px-3 py-2 font-semibold">상태</th>
                <th className="px-3 py-2 font-semibold">
                  {status === "used" ? "사용" : "발급 · 기한"}
                </th>
                <th className="px-3 py-2 font-semibold">처리 내용</th>
                {canManage && (
                  <th className="px-3 py-2 font-semibold w-[1%]"></th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E0D0] dark:divide-zinc-800">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-3 py-2.5">
                    <a
                      href={`/crm/members/${r.memberId}`}
                      className="font-semibold text-[#2A251D] dark:text-zinc-100 hover:underline"
                    >
                      {r.memberName}
                    </a>
                    {r.memberPhone && (
                      <div className="text-[11.5px] text-[#8C8270]">
                        {formatPhone(r.memberPhone)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-[#2A251D] dark:text-zinc-100">
                      {r.couponName}
                    </div>
                    <div className="text-[11.5px] text-[#8C8270]">
                      {r.benefit} · <span className="font-mono">{r.code}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2.5 text-[#6B5D47] dark:text-zinc-400 whitespace-nowrap">
                    {r.status === "used" ? (
                      formatDateTime(r.usedAt)
                    ) : (
                      <>
                        <div>{formatDateTime(r.issuedAt)}</div>
                        <div className="text-[11.5px] text-[#A89B80]">
                          ~ {formatYmd(r.expiresAt)}
                        </div>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[#6B5D47] dark:text-zinc-400">
                    {r.status === "used" && (
                      <>
                        <div className="text-[#2A251D] dark:text-zinc-100">
                          {r.usedFor ?? "결제 연결 정보 없음"}
                        </div>
                        <div className="text-[11.5px]">
                          {r.originalPriceWon != null &&
                            `정가 ${won(r.originalPriceWon)} · `}
                          <b className="text-[#4d5a29] dark:text-[#A8B87A]">
                            -{won(r.discountWon)}
                          </b>
                          {r.usedByName && ` · ${r.usedByName}`}
                        </div>
                      </>
                    )}
                    {r.status === "revoked" && (
                      <div className="text-[11.5px]">
                        {formatDateTime(r.revokedAt)} 회수
                        {r.revokedByName && ` · ${r.revokedByName}`}
                        {r.revokeReason && (
                          <div className="text-[#A89B80]">{r.revokeReason}</div>
                        )}
                      </div>
                    )}
                  </td>
                  {canManage && (
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {(r.status === "issued" || r.status === "expired") && (
                        <button
                          type="button"
                          className={dangerBtn}
                          disabled={busy === r.id}
                          onClick={() => act(r, "revoke")}
                        >
                          회수
                        </button>
                      )}
                      {r.status === "revoked" && (
                        <button
                          type="button"
                          className={ghostBtn}
                          disabled={busy === r.id}
                          onClick={() => act(r, "restore")}
                        >
                          회수 취소
                        </button>
                      )}
                      {r.status === "used" && (
                        <button
                          type="button"
                          className={ghostBtn}
                          disabled={busy === r.id}
                          onClick={() => act(r, "unuse")}
                        >
                          사용 취소
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
