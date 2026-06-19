"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/auth-provider";
import {
  ISSUE_TYPE_LABEL,
  PAYMENT_METHOD_LABEL,
  PASS_STATUS_LABEL,
  formatWon,
} from "../_components/crm-labels";
import { crmInputClass } from "../_components/crm-modal";

interface PassRow {
  id: number;
  member_id: number;
  member_name: string;
  trainer_member_id: number;
  seller_member_id: number;
  issue_type: string;
  lesson_kind: string;
  total_sessions: number;
  remaining_sessions: number;
  session_minutes: number;
  price_won: number;
  payment_method: string;
  payment_method_custom: string | null;
  issued_at: string;
  expires_at: string;
  status: string;
}

interface StaffOption {
  id: number;
  display_name: string;
  role: string;
  status: string;
}

export default function CrmPassesPage() {
  const { getIdToken } = useAuth();
  const [list, setList] = useState<PassRow[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 필터
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [trainerFilter, setTrainerFilter] = useState<string>("");
  const [paymentFilter, setPaymentFilter] = useState<string>("");

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (trainerFilter) params.set("trainer_id", trainerFilter);
      if (paymentFilter) params.set("payment_method", paymentFilter);
      const res = await fetch(`/api/crm/passes?${params}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setList(data.passes ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, statusFilter, trainerFilter, paymentFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/crm/staff", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStaff((data.staff ?? []).filter((s: StaffOption) => s.status === "active"));
      }
    })();
  }, [getIdToken]);

  const staffMap = new Map(staff.map((s) => [s.id, s.display_name]));

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-7xl mx-auto">
      <header className="mb-5">
        <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
          수강권 관리
        </h1>
        <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
          발급된 모든 수강권을 한 화면에서 확인해요.
        </p>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-2">
        <select
          className={crmInputClass}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">모든 상태</option>
          <option value="valid">유효</option>
          <option value="expired">만료</option>
          <option value="refunded">환불</option>
        </select>
        <select
          className={crmInputClass}
          value={trainerFilter}
          onChange={(e) => setTrainerFilter(e.target.value)}
        >
          <option value="">모든 강사</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.display_name}
            </option>
          ))}
        </select>
        <select
          className={crmInputClass}
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
        >
          <option value="">모든 결제 수단</option>
          {Object.entries(PAYMENT_METHOD_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
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
        <Msg>일치하는 수강권이 없습니다.</Msg>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#E8E0D0] dark:border-zinc-800">
          <table className="w-full text-[13px]">
            <thead className="bg-[#FBF7EB] dark:bg-zinc-900/80 text-[#6B5D47] dark:text-zinc-400">
              <tr>
                <Th>회원</Th>
                <Th>수업</Th>
                <Th>잔여</Th>
                <Th>금액</Th>
                <Th>결제</Th>
                <Th>강사</Th>
                <Th>발급</Th>
                <Th>만료</Th>
                <Th>상태</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className="border-t border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
                  <Td>
                    <Link
                      href={`/crm/members/${p.member_id}`}
                      className="font-semibold text-[#2A251D] dark:text-zinc-100 hover:text-[#6B7B3A]"
                    >
                      {p.member_name || "—"}
                    </Link>
                  </Td>
                  <Td>
                    {p.lesson_kind}
                    <span className="ml-1 text-[11.5px] text-[#A89B80]">
                      · {ISSUE_TYPE_LABEL[p.issue_type] ?? p.issue_type}
                    </span>
                  </Td>
                  <Td>
                    <span className="font-medium">
                      {p.remaining_sessions}
                    </span>
                    <span className="text-[#A89B80]"> / {p.total_sessions}</span>
                  </Td>
                  <Td>{formatWon(p.price_won)}원</Td>
                  <Td>
                    {p.payment_method === "etc" && p.payment_method_custom
                      ? p.payment_method_custom
                      : PAYMENT_METHOD_LABEL[p.payment_method] ?? p.payment_method}
                  </Td>
                  <Td className="text-[#6B5D47] dark:text-zinc-400">
                    {staffMap.get(p.trainer_member_id) ?? "—"}
                  </Td>
                  <Td className="text-[#8C8270] dark:text-zinc-500">{p.issued_at}</Td>
                  <Td className="text-[#8C8270] dark:text-zinc-500">{p.expires_at}</Td>
                  <Td>
                    <StatusChip status={p.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
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
    <div className="px-4 py-10 text-center text-[13px] text-[#8C8270] dark:text-zinc-500 border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
      {children}
    </div>
  );
}
