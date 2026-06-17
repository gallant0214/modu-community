"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/auth-provider";
import {
  ROLE_LABEL,
  EMPLOYMENT_STATUS_LABEL,
  EMPLOYMENT_TYPE_LABEL,
  formatPhone,
} from "../_components/crm-labels";
import { crmInputClass } from "../_components/crm-modal";

interface StaffRow {
  id: number;
  role: string;
  display_name: string;
  phone: string | null;
  email: string | null;
  employment_status: string;
  employment_type: string | null;
  status: string;
}

export default function CrmPayrollPage() {
  const { getIdToken } = useAuth();
  const [list, setList] = useState<StaffRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch("/api/crm/staff", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setList((data.staff ?? []).filter((s: StaffRow) => s.status === "active"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = list.filter((s) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      s.display_name.toLowerCase().includes(q) ||
      (s.phone || "").includes(q) ||
      (s.email || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="px-5 md:px-8 py-6 md:py-8 max-w-6xl mx-auto">
      <header className="mb-5">
        <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
          직원 급여
        </h1>
        <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
          강사를 선택하면 매출·담당 회원·수업 내역을 확인할 수 있어요.
        </p>
      </header>

      <div className="mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름, 연락처, 이메일로 검색"
          className={crmInputClass}
        />
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : filtered.length === 0 ? (
        <div className="px-4 py-10 text-center text-[13px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
          {query ? "일치하는 강사가 없습니다." : "등록된 강사가 없습니다."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#E8E0D0] dark:border-zinc-800">
          <table className="w-full text-[13.5px]">
            <thead className="bg-[#FBF7EB] dark:bg-zinc-900/80 text-[#6B5D47] dark:text-zinc-400">
              <tr>
                <Th>이름</Th>
                <Th>등급</Th>
                <Th>재직상태</Th>
                <Th>근무형태</Th>
                <Th>연락처</Th>
                <Th>이메일</Th>
                <Th className="text-right pr-4">상세</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-t border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 hover:bg-[#FBF7EB] dark:hover:bg-zinc-900/60">
                  <Td>
                    <Link
                      href={`/crm/payroll/${s.id}`}
                      className="font-semibold text-[#2A251D] dark:text-zinc-100 hover:text-[#6B7B3A]"
                    >
                      {s.display_name}
                    </Link>
                  </Td>
                  <Td className="text-[#3A342A] dark:text-zinc-300">
                    {ROLE_LABEL[s.role] ?? s.role}
                  </Td>
                  <Td className="text-[#6B5D47] dark:text-zinc-400">
                    {EMPLOYMENT_STATUS_LABEL[s.employment_status] ?? s.employment_status}
                  </Td>
                  <Td className="text-[#6B5D47] dark:text-zinc-400">
                    {s.employment_type ? EMPLOYMENT_TYPE_LABEL[s.employment_type] ?? s.employment_type : "—"}
                  </Td>
                  <Td className="text-[#6B5D47] dark:text-zinc-400">
                    {s.phone ? formatPhone(s.phone) : "—"}
                  </Td>
                  <Td className="text-[#8C8270] dark:text-zinc-500">{s.email || "—"}</Td>
                  <Td className="text-right pr-4">
                    <Link
                      href={`/crm/payroll/${s.id}`}
                      className="inline-flex items-center px-2.5 py-1 rounded-md border border-[#E8E0D0] dark:border-zinc-700 text-[#6B7B3A] dark:text-[#A8B87A] text-[12px] font-medium hover:bg-[#6B7B3A]/5"
                    >
                      상세
                    </Link>
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

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`text-left font-medium px-3 py-2.5 whitespace-nowrap ${className || ""}`}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 whitespace-nowrap ${className || ""}`}>{children}</td>;
}
