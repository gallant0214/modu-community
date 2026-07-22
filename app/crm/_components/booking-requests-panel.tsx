"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";

interface BookingRequest {
  id: number;
  memberName: string;
  memberPhone: string;
  trainerName: string;
  lessonKind: string;
  remainingSessions: number | null;
  startsAt: string;
  endsAt: string;
}

function fmtKst(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  const dow = ["일", "월", "화", "수", "목", "금", "토"][d.getUTCDay()];
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${dow}) ${hh}:${mm}`;
}

/**
 * 회원 앱(모두의지도사스케줄)에서 들어온 예약요청 승인/거절 패널.
 * status='requested' 목록을 보여주고 승인 시 booked 로 확정 + 회원에게 푸시.
 */
export default function BookingRequestsPanel({ onChanged }: { onChanged?: () => void }) {
  const { getIdToken } = useAuth();
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/crm/reservations/requests", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      setRequests(data.requests ?? []);
    } catch {
      /* ignore */
    }
  }, [getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id: number, action: "approve" | "reject") => {
    if (busyId) return;
    if (action === "reject" && !confirm("이 예약요청을 거절할까요?")) return;
    setBusyId(id);
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch(`/api/crm/reservations/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || "처리 실패");
        return;
      }
      setRequests((prev) => prev.filter((r) => r.id !== id));
      onChanged?.();
    } finally {
      setBusyId(null);
    }
  };

  if (requests.length === 0) return null;

  return (
    <div className="mb-4 rounded-2xl border border-[#E8A020]/40 bg-[#FFF8EC] dark:bg-amber-950/20 dark:border-amber-900/40 overflow-hidden">
      <div className="px-4 py-2.5 flex items-center gap-2 border-b border-[#E8A020]/25 dark:border-amber-900/40">
        <span className="w-5 h-5 rounded-full bg-[#E8A020] text-white text-[11px] font-bold flex items-center justify-center">
          {requests.length}
        </span>
        <h2 className="text-[13.5px] font-semibold text-[#8A5A00] dark:text-amber-300">
          회원 예약요청 (승인 대기)
        </h2>
      </div>
      <ul className="divide-y divide-[#E8A020]/15 dark:divide-amber-900/30">
        {requests.map((r) => (
          <li key={r.id} className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex-1 min-w-[200px]">
              <div className="text-[13.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
                {r.memberName}
                <span className="ml-2 text-[12px] font-normal text-[#8C8270] dark:text-zinc-400">
                  {r.lessonKind}
                  {r.remainingSessions != null ? ` · 잔여 ${r.remainingSessions}회` : ""}
                </span>
              </div>
              <div className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400 mt-0.5">
                {fmtKst(r.startsAt)} · {r.trainerName} 트레이너
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => act(r.id, "reject")}
                disabled={busyId === r.id}
                className="px-3 py-1.5 rounded-lg text-[12.5px] font-medium border border-[#E8E0D0] dark:border-zinc-700 text-[#8C8270] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 disabled:opacity-50"
              >
                거절
              </button>
              <button
                onClick={() => act(r.id, "approve")}
                disabled={busyId === r.id}
                className="px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold bg-[#6B7B3A] text-white hover:bg-[#5A6A2E] disabled:opacity-50"
              >
                승인
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
