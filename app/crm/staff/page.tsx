"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/auth-provider";
import { ROLE_LABEL, ACCESS_LEVEL_LABEL, STATUS_LABEL } from "../_components/crm-labels";

interface StaffRow {
  id: number;
  firebase_uid: string;
  role: string;
  display_name: string;
  phone: string | null;
  email: string | null;
  access_level: string;
  is_solo_owner: boolean;
  status: string;
  joined_at: string;
  left_at: string | null;
}

export default function CrmStaffPage() {
  const { getIdToken } = useAuth();
  const [list, setList] = useState<StaffRow[]>([]);
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
      setList(data.staff ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  const active = list.filter((s) => s.status === "active");
  const inactive = list.filter((s) => s.status !== "active");

  return (
    <div className="px-5 md:px-8 py-6 md:py-8 max-w-6xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
            직원 관리
          </h1>
          <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
            가입한 직원의 등급과 권한을 관리해요.
          </p>
        </div>
      </header>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <ListMessage>불러오는 중…</ListMessage>
      ) : (
        <>
          <StaffTable rows={active} label="재직 중" />
          {inactive.length > 0 && (
            <div className="mt-8">
              <StaffTable rows={inactive} label="퇴사" muted />
            </div>
          )}
        </>
      )}

      <Hint>
        강사가 직접 가입하려면 onboarding에서 센터를 검색해 가입할 수 있어요. 가입 직후엔 권한이 없으니 여기서 등급과 권한을 조정해 주세요.
      </Hint>
    </div>
  );
}

function StaffTable({ rows, label, muted }: { rows: StaffRow[]; label: string; muted?: boolean }) {
  if (rows.length === 0) {
    return <ListMessage>{label}인 직원이 없습니다.</ListMessage>;
  }
  return (
    <div>
      <div className="text-[12px] font-medium text-[#A89B80] dark:text-zinc-500 mb-2">
        {label} ({rows.length}명)
      </div>
      <div className={`overflow-x-auto rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 ${muted ? "opacity-70" : ""}`}>
        <table className="w-full text-[13.5px]">
          <thead className="bg-[#FBF7EB] dark:bg-zinc-900/80 text-[#6B5D47] dark:text-zinc-400">
            <tr>
              <Th>이름</Th>
              <Th>등급</Th>
              <Th>권한</Th>
              <Th>이메일</Th>
              <Th>가입일</Th>
              <Th className="text-right pr-4">관리</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-t border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
                <Td>
                  <span className="font-semibold text-[#2A251D] dark:text-zinc-100">{s.display_name}</span>
                  {s.is_solo_owner && (
                    <span className="ml-1.5 text-[11px] text-[#A89B80]">· 본인</span>
                  )}
                </Td>
                <Td>{ROLE_LABEL[s.role] ?? s.role}</Td>
                <Td>{ACCESS_LEVEL_LABEL[s.access_level] ?? s.access_level}</Td>
                <Td className="text-[#8C8270] dark:text-zinc-500">{s.email || "—"}</Td>
                <Td className="text-[#8C8270] dark:text-zinc-500">{formatDate(s.joined_at)}</Td>
                <Td className="text-right pr-4">
                  <Link
                    href={`/crm/staff/${s.id}`}
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
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`text-left font-medium px-3 py-2.5 ${className || ""}`}>{children}</th>
  );
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 ${className || ""}`}>{children}</td>;
}
function ListMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-10 text-center text-[13px] text-[#8C8270] dark:text-zinc-500 border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
      {children}
    </div>
  );
}
function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 px-3.5 py-2.5 rounded-lg bg-[#FBF7EB] dark:bg-zinc-900/60 border border-[#E8E0D0]/70 dark:border-zinc-800 text-[12.5px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed">
      <strong className="font-semibold text-[#3A342A] dark:text-zinc-300">팁</strong>
      <span className="mx-1.5">·</span>
      {children}
    </div>
  );
}
function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}
