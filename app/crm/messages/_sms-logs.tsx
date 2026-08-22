"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";

interface SmsLog {
  id: number;
  receivers: string;
  receiver_cnt: number;
  msg: string;
  msg_type: string;
  title: string | null;
  testmode: boolean;
  result_code: number;
  result_msg: string;
  success_cnt: number;
  error_cnt: number;
  sent_by_name: string | null;
  created_at: string;
}

function formatDateTime(iso: string): string {
  try {
    const k = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
  } catch {
    return iso;
  }
}

export function SmsLogsTab() {
  const { getIdToken } = useAuth();
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/crm/sms/logs?limit=100", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
          문자 발송 기록과 성공·실패 건수를 확인해요. (최근 100건)
        </p>
        <button
          type="button"
          onClick={load}
          className="px-2.5 py-1 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#FBF7EB] dark:hover:bg-zinc-800"
        >
          새로고침
        </button>
      </div>

      {loading ? (
        <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : logs.length === 0 ? (
        <div className="px-4 py-8 text-center text-[12.5px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
          아직 문자 발송 기록이 없어요.
        </div>
      ) : (
        <ul className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 overflow-hidden divide-y divide-[#E8E0D0]/70 dark:divide-zinc-800">
          {logs.map((l) => {
            const failed = l.error_cnt > 0 || l.result_code < 0;
            const isOpen = expanded === l.id;
            return (
              <li key={l.id} className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : l.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                          l.testmode
                            ? "bg-[#F5F0E5] text-[#A89B80] border-[#E8E0D0] dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                            : failed
                              ? "bg-red-50 text-red-600 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/60"
                              : "bg-[#6B7B3A]/10 text-[#6B7B3A] border-[#6B7B3A]/30 dark:bg-[#6B7B3A]/25 dark:text-[#A8B87A]"
                        }`}
                      >
                        {l.testmode ? "테스트" : failed ? "실패 포함" : "발송 완료"}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10.5px] font-semibold bg-[#EFE9DA] text-[#6B5D47] dark:bg-zinc-800 dark:text-zinc-400">
                        {l.msg_type}
                      </span>
                      <span className="text-[12px] text-[#6B5D47] dark:text-zinc-300">
                        {l.receiver_cnt}명
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11.5px]">
                      <span className="text-[#6B7B3A] dark:text-[#A8B87A] font-semibold">성공 {l.success_cnt}</span>
                      {l.error_cnt > 0 && (
                        <span className="text-red-600 dark:text-red-400 font-semibold">실패 {l.error_cnt}</span>
                      )}
                      <span className="text-[#A89B80]">{formatDateTime(l.created_at)}</span>
                    </div>
                  </div>
                  <div className="mt-1.5 text-[12.5px] text-[#3A342A] dark:text-zinc-300 line-clamp-2 whitespace-pre-wrap">
                    {l.title ? <strong>[{l.title}] </strong> : null}
                    {l.msg}
                  </div>
                </button>

                {isOpen && (
                  <div className="mt-2 pt-2 border-t border-[#E8E0D0]/70 dark:border-zinc-800 space-y-1 text-[12px] text-[#6B5D47] dark:text-zinc-400">
                    <div>
                      <span className="text-[#A89B80]">수신번호: </span>
                      <span className="font-mono">{l.receivers}</span>
                    </div>
                    <div>
                      <span className="text-[#A89B80]">결과: </span>
                      <span className={failed ? "text-red-600 dark:text-red-400" : ""}>
                        {l.result_msg || (failed ? "실패" : "정상")}
                      </span>
                    </div>
                    {l.sent_by_name && (
                      <div>
                        <span className="text-[#A89B80]">발송자: </span>
                        {l.sent_by_name}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
