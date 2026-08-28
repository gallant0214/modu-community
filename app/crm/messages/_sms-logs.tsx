"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";

interface MsgLog {
  key: string;
  channel: "sms" | "push";
  title: string | null;
  content: string;
  recipient_label: string;
  receiver_cnt: number;
  msg_type: string | null;
  testmode: boolean;
  result_code: number | null;
  result_msg: string | null;
  success_cnt: number | null;
  error_cnt: number | null;
  read_count: number | null;
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
  const [logs, setLogs] = useState<MsgLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // reset=true: 처음부터 새로 조회 / false: nextCursor 이전 것 이어붙이기(더 보기)
  const load = useCallback(
    async (reset: boolean) => {
      if (reset) setLoading(true);
      else setLoadingMore(true);
      try {
        const token = await getIdToken();
        if (!token) return;
        const cursor = reset ? null : nextCursor;
        const qs = cursor ? `?before=${encodeURIComponent(cursor)}` : "";
        const res = await fetch(`/api/crm/sms/logs${qs}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          const newLogs: MsgLog[] = data.logs ?? [];
          setLogs((prev) => (reset ? newLogs : [...prev, ...newLogs]));
          setNextCursor(data.next_cursor ?? null);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [getIdToken, nextCursor]
  );

  useEffect(() => {
    load(true);
    // 최초 1회만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getIdToken]);

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
          문자·앱푸시 등 모든 메세지 전송 기록을 확인해요. (누적 · 받는 사람·발송 직원 표시)
        </p>
        <button
          type="button"
          onClick={() => load(true)}
          className="px-2.5 py-1 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#FBF7EB] dark:hover:bg-zinc-800"
        >
          새로고침
        </button>
      </div>

      {loading ? (
        <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : logs.length === 0 ? (
        <div className="px-4 py-8 text-center text-[12.5px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
          아직 메세지 전송 기록이 없어요.
        </div>
      ) : (
        <ul className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 overflow-hidden divide-y divide-[#E8E0D0]/70 dark:divide-zinc-800">
          {logs.map((l) => {
            const isPush = l.channel === "push";
            const failed = !isPush && ((l.error_cnt ?? 0) > 0 || (l.result_code ?? 0) < 0);
            const isOpen = expanded === l.key;
            return (
              <li key={l.key} className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : l.key)}
                  className="w-full text-left"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      {/* 채널 배지 */}
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                          isPush
                            ? "bg-[#5A8BB0]/12 text-[#487596] border-[#5A8BB0]/30 dark:bg-[#5A8BB0]/20 dark:text-[#8FB7D4]"
                            : "bg-[#B47B2A]/12 text-[#B47B2A] border-[#B47B2A]/30 dark:bg-amber-900/30 dark:text-amber-300"
                        }`}
                      >
                        {isPush ? "앱푸시" : "문자"}
                      </span>
                      {/* 상태 배지 */}
                      {!isPush && (
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
                      )}
                      {l.msg_type && (
                        <span className="px-1.5 py-0.5 rounded text-[10.5px] font-semibold bg-[#EFE9DA] text-[#6B5D47] dark:bg-zinc-800 dark:text-zinc-400">
                          {l.msg_type}
                        </span>
                      )}
                      <span className="text-[12px] text-[#6B5D47] dark:text-zinc-300">
                        {l.receiver_cnt}명
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11.5px]">
                      {isPush ? (
                        l.read_count != null && (
                          <span className="text-[#487596] dark:text-[#8FB7D4] font-semibold">읽음 {l.read_count}</span>
                        )
                      ) : (
                        <>
                          <span className="text-[#6B7B3A] dark:text-[#A8B87A] font-semibold">성공 {l.success_cnt ?? 0}</span>
                          {(l.error_cnt ?? 0) > 0 && (
                            <span className="text-red-600 dark:text-red-400 font-semibold">실패 {l.error_cnt}</span>
                          )}
                        </>
                      )}
                      <span className="text-[#A89B80]">{formatDateTime(l.created_at)}</span>
                    </div>
                  </div>
                  {/* 받는 사람 · 발송 직원 요약 줄 */}
                  <div className="mt-1 flex items-center gap-3 flex-wrap text-[11.5px] text-[#8C8270] dark:text-zinc-500">
                    <span>
                      받는 사람: <span className="text-[#6B5D47] dark:text-zinc-300 font-medium">{l.recipient_label}</span>
                    </span>
                    <span>
                      발송: <span className="text-[#6B5D47] dark:text-zinc-300 font-medium">{l.sent_by_name || "—"}</span>
                    </span>
                  </div>
                  <div className="mt-1.5 text-[12.5px] text-[#3A342A] dark:text-zinc-300 line-clamp-2 whitespace-pre-wrap">
                    {l.title ? <strong>[{l.title}] </strong> : null}
                    {l.content}
                  </div>
                </button>

                {isOpen && (
                  <div className="mt-2 pt-2 border-t border-[#E8E0D0]/70 dark:border-zinc-800 space-y-1 text-[12px] text-[#6B5D47] dark:text-zinc-400">
                    {!isPush && l.result_msg && (
                      <div>
                        <span className="text-[#A89B80]">결과: </span>
                        <span className={failed ? "text-red-600 dark:text-red-400" : ""}>{l.result_msg}</span>
                      </div>
                    )}
                    {l.sent_by_name && (
                      <div>
                        <span className="text-[#A89B80]">발송자: </span>
                        {l.sent_by_name}
                      </div>
                    )}
                    <div className="whitespace-pre-wrap">
                      <span className="text-[#A89B80]">내용: </span>
                      {l.content}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!loading && nextCursor && (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => load(false)}
            disabled={loadingMore}
            className="px-4 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12.5px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#FBF7EB] dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            {loadingMore ? "불러오는 중…" : "더 보기"}
          </button>
        </div>
      )}
    </div>
  );
}
