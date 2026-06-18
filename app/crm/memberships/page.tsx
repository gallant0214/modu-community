"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { CrmModal, CrmField, crmInputClass } from "../_components/crm-modal";
import {
  PAYMENT_METHOD_LABEL,
  PASS_STATUS_LABEL,
  formatWon,
  parseWon,
  formatPhone,
} from "../_components/crm-labels";

interface Row {
  id: number;
  member_id: number;
  member_name: string;
  plan_name: string;
  duration_days: number;
  price_won: number;
  payment_method: string;
  payment_method_custom: string | null;
  start_date: string;
  expires_at: string;
  status: string;
}

export default function CrmMembershipsPage() {
  const { getIdToken } = useAuth();
  const [list, setList] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [issueOpen, setIssueOpen] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/crm/memberships?${params}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setList(data.memberships ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="px-5 md:px-8 py-6 md:py-8 max-w-7xl mx-auto">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
            회원권 관리
          </h1>
          <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
            헬스장 출입권 같은 기간형 회원권을 발급하고 관리해요.
          </p>
        </div>
        <button
          onClick={() => setIssueOpen(true)}
          className="px-3 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932] whitespace-nowrap"
        >
          + 회원권 발급
        </button>
      </header>

      <div className="mb-4">
        <select
          className={crmInputClass}
          style={{ maxWidth: 160 }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">모든 상태</option>
          <option value="valid">유효</option>
          <option value="expired">만료</option>
          <option value="refunded">환불</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <Msg>불러오는 중…</Msg>
      ) : list.length === 0 ? (
        <Msg>발급된 회원권이 없습니다.</Msg>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#E8E0D0] dark:border-zinc-800">
          <table className="w-full text-[13px]">
            <thead className="bg-[#FBF7EB] dark:bg-zinc-900/80 text-[#6B5D47] dark:text-zinc-400">
              <tr>
                <Th>회원</Th>
                <Th>플랜</Th>
                <Th>기간(일)</Th>
                <Th>시작</Th>
                <Th>만료</Th>
                <Th>금액</Th>
                <Th>결제</Th>
                <Th>상태</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr
                  key={p.id}
                  className="border-t border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900"
                >
                  <Td><span className="font-semibold">{p.member_name || "—"}</span></Td>
                  <Td>{p.plan_name}</Td>
                  <Td>{p.duration_days}일</Td>
                  <Td className="text-[#8C8270]">{p.start_date}</Td>
                  <Td className="text-[#8C8270]">{p.expires_at}</Td>
                  <Td>{formatWon(p.price_won)}원</Td>
                  <Td>
                    {p.payment_method === "etc" && p.payment_method_custom
                      ? p.payment_method_custom
                      : PAYMENT_METHOD_LABEL[p.payment_method] ?? p.payment_method}
                  </Td>
                  <Td>
                    <StatusChip status={p.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <IssueModal
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        onSuccess={() => {
          setIssueOpen(false);
          load();
        }}
      />
    </div>
  );
}

function IssueModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { getIdToken } = useAuth();
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<{ id: number; name: string; phone: string | null }[]>([]);
  const [picked, setPicked] = useState<{ id: number; name: string; phone: string | null } | null>(null);
  const [planName, setPlanName] = useState("1개월 헬스 이용권");
  const [duration, setDuration] = useState(30);
  const [priceWon, setPriceWon] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "transfer" | "etc">("card");
  const [paymentCustom, setPaymentCustom] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expiresAt, setExpiresAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setMemberQuery("");
      setMemberResults([]);
      setPicked(null);
      setPlanName("1개월 헬스 이용권");
      setDuration(30);
      setPriceWon(0);
      setPaymentMethod("card");
      setPaymentCustom("");
      setMemo("");
      setError("");
    }
  }, [open]);

  // duration 변경 시 expires_at 자동 계산
  useEffect(() => {
    if (!startDate || !duration) return;
    const d = new Date(startDate);
    d.setDate(d.getDate() + Number(duration));
    setExpiresAt(d.toISOString().slice(0, 10));
  }, [startDate, duration]);

  const search = async () => {
    const q = memberQuery.trim();
    if (!q) return;
    const token = await getIdToken();
    const res = await fetch(`/api/crm/members?q=${encodeURIComponent(q)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setMemberResults(data.members ?? []);
    }
  };

  const submit = async () => {
    setError("");
    if (!picked) return setError("회원을 선택해 주세요");
    if (!planName.trim()) return setError("플랜명을 입력해 주세요");
    if (duration < 1) return setError("기간은 1일 이상이어야 해요");
    setSubmitting(true);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/memberships", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          member_id: picked.id,
          plan_name: planName.trim(),
          duration_days: duration,
          price_won: priceWon,
          payment_method: paymentMethod,
          payment_method_custom: paymentMethod === "etc" ? paymentCustom : undefined,
          start_date: startDate,
          expires_at: expiresAt,
          memo: memo || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "발급 실패");
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CrmModal open={open} onClose={onClose} title="회원권 발급" size="lg">
      <div className="space-y-3">
        <CrmField label="회원" required>
          {picked ? (
            <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-[#6B7B3A]/40 bg-[#6B7B3A]/5">
              <span className="text-[13.5px] text-[#3A342A] dark:text-zinc-200">
                <strong>{picked.name}</strong>
                {picked.phone && (
                  <span className="ml-2 text-[12px] text-[#8C8270]">{formatPhone(picked.phone)}</span>
                )}
              </span>
              <button
                onClick={() => setPicked(null)}
                className="text-[12px] text-[#6B7B3A] hover:underline"
              >
                다시 선택
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  className={`${crmInputClass} flex-1`}
                  value={memberQuery}
                  onChange={(e) => setMemberQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && search()}
                  placeholder="회원 이름 또는 연락처"
                />
                <button
                  onClick={search}
                  className="px-4 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold"
                >
                  검색
                </button>
              </div>
              {memberResults.length > 0 && (
                <ul className="mt-2 space-y-1.5 max-h-[160px] overflow-y-auto">
                  {memberResults.map((m) => (
                    <li key={m.id}>
                      <button
                        onClick={() => setPicked(m)}
                        className="w-full text-left px-3 py-2 rounded-lg border border-[#E8E0D0] hover:border-[#6B7B3A]/40"
                      >
                        <div className="text-[13px] font-medium">{m.name}</div>
                        {m.phone && (
                          <div className="text-[11.5px] text-[#A89B80]">{formatPhone(m.phone)}</div>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </CrmField>

        <CrmField label="플랜명" required>
          <input
            className={crmInputClass}
            value={planName}
            onChange={(e) => setPlanName(e.target.value)}
            placeholder="예) 3개월 헬스 이용권"
          />
        </CrmField>

        <div className="grid grid-cols-2 gap-2">
          <CrmField label="기간 (일)" required>
            <input
              type="number"
              min={1}
              className={crmInputClass}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value) || 0)}
            />
          </CrmField>
          <CrmField label="결제 금액 (원)">
            <input
              type="text"
              inputMode="numeric"
              className={crmInputClass}
              value={priceWon ? formatWon(priceWon) : ""}
              onChange={(e) => setPriceWon(parseWon(e.target.value))}
              placeholder="0"
            />
          </CrmField>
        </div>

        <CrmField label="결제 수단">
          <div className="grid grid-cols-4 gap-1.5">
            {(["cash", "card", "transfer", "etc"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setPaymentMethod(m)}
                className={`px-2 py-2 rounded-lg text-[12px] font-medium
                  ${paymentMethod === m
                    ? "border border-[#6B7B3A] bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A]"
                    : "border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300"
                  }`}
              >
                {PAYMENT_METHOD_LABEL[m]}
              </button>
            ))}
          </div>
          {paymentMethod === "etc" && (
            <input
              className={`${crmInputClass} mt-2`}
              value={paymentCustom}
              onChange={(e) => setPaymentCustom(e.target.value)}
              placeholder="결제 수단을 직접 입력하세요"
            />
          )}
        </CrmField>

        <div className="grid grid-cols-2 gap-2">
          <CrmField label="시작일" required>
            <input
              type="date"
              className={crmInputClass}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </CrmField>
          <CrmField label="만료일" required>
            <input
              type="date"
              className={crmInputClass}
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </CrmField>
        </div>

        <CrmField label="메모">
          <textarea
            className={`${crmInputClass} min-h-[60px]`}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </CrmField>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-50 text-[13px] text-red-700">{error}</div>
        )}

        <button
          onClick={submit}
          disabled={submitting}
          className="w-full px-4 py-3 rounded-lg bg-[#6B7B3A] disabled:opacity-60 text-white text-[14.5px] font-semibold hover:bg-[#5a6932] mt-2"
        >
          {submitting ? "발급 중…" : "회원권 발급"}
        </button>
      </div>
    </CrmModal>
  );
}

function StatusChip({ status }: { status: string }) {
  const label = PASS_STATUS_LABEL[status] ?? status;
  const cls =
    status === "valid"
      ? "bg-[#EFE7D5] text-[#6B7B3A] dark:bg-[#6B7B3A]/20 dark:text-[#A8B87A]"
      : status === "expired"
      ? "bg-[#F5F0E5] text-[#A89B80] dark:bg-zinc-800 dark:text-zinc-500"
      : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left font-medium px-3 py-2.5 whitespace-nowrap">{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 whitespace-nowrap ${className || ""}`}>{children}</td>;
}
function Msg({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-10 text-center text-[13px] text-[#8C8270] border border-dashed border-[#E8E0D0] rounded-xl">
      {children}
    </div>
  );
}
