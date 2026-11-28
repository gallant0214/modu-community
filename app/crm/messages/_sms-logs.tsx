"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { formatPhone } from "../_components/crm-labels";
import { AUTO_MESSAGE_CATEGORIES } from "@/app/lib/auto-message-triggers";

interface MsgLog {
  key: string;
  channel: "sms" | "push";
  title: string | null;
  content: string;
  recipient_label: string;
  /** 받는 사람 목록 (기록 하나당 최대 50명) — 펼쳤을 때 이름·번호로 보여준다 */
  recipients: { member_id: number | null; name: string | null; phone: string | null }[];
  receiver_cnt: number;
  msg_type: string | null;
  testmode: boolean;
  result_code: number | null;
  result_msg: string | null;
  success_cnt: number | null;
  error_cnt: number | null;
  read_count: number | null;
  sent_by_name: string | null;
  /** 자동 메세지면 트리거 키·이름 (직접 발송은 null) */
  auto_trigger_key?: string | null;
  auto_label?: string | null;
  created_at: string;
}

/**
 * 회원마다 문구가 다른 묶음 발송(쿠폰 발송 #회원명# 등)은 로그에 **원본 문구(#변수# 포함)** 를 남긴다.
 * 실제로 받은 문구는 회원별 값으로 바뀌어 나갔으므로, 그런 기록에는 참고 문구를 붙인다 (2026-11-16 사용자 요청).
 * 1명에게 보낸 기록은 로그 = 실제 받은 문구라서 붙이지 않는다(남은 #변수# 가 정말로 나간 것).
 */
const VAR_TOKEN_RE = /#[^#\s]{1,12}#/;
function isTemplateLog(l: { receiver_cnt: number; content: string }): boolean {
  return l.receiver_cnt > 1 && VAR_TOKEN_RE.test(l.content);
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  // 종류별 필터: "" 전체 · manual 직접 발송 · auto 자동 전체 · auto:<트리거키>
  const [filter, setFilter] = useState("");
  // 필터를 빨리 바꿀 때 늦게 도착한 이전 응답이 목록을 덮어쓰지 않게
  const reqSeq = useRef(0);

  // reset=true: 처음부터 새로 조회 / false: nextCursor 이전 것 이어붙이기(더 보기)
  const load = useCallback(
    async (reset: boolean) => {
      if (reset) setLoading(true);
      else setLoadingMore(true);
      const seq = ++reqSeq.current;
      try {
        const token = await getIdToken();
        if (!token) return;
        const cursor = reset ? null : nextCursor;
        const params = new URLSearchParams();
        if (cursor) params.set("before", cursor);
        if (filter) params.set("filter", filter);
        const qs = params.toString() ? `?${params.toString()}` : "";
        const res = await fetch(`/api/crm/sms/logs${qs}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = await res.json().catch(() => null);
        if (seq !== reqSeq.current) return;
        if (res.ok) {
          const newLogs: MsgLog[] = data?.logs ?? [];
          setLogs((prev) => (reset ? newLogs : [...prev, ...newLogs]));
          setNextCursor(data?.next_cursor ?? null);
          setLoadError(null);
        } else {
          // 권한 없음·센터 SMS 미설정을 '빈 목록' 으로 보여주면 원인을 알 수 없다
          if (reset) setLogs([]);
          setNextCursor(null);
          setLoadError(data?.error || "발송 기록을 볼 권한이 없어요");
        }
      } finally {
        if (seq === reqSeq.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [getIdToken, nextCursor, filter]
  );

  useEffect(() => {
    load(true);
    // 최초 1회 + 필터를 바꿀 때마다 처음부터 다시
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getIdToken, filter]);

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <p className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
          문자·앱푸시 등 모든 메세지 전송 기록을 확인해요. (누적 · 받는 사람·발송 직원 표시)
        </p>
        <div className="flex items-center gap-2 shrink-0">
        <select
          value={filter}
          onChange={(e) => {
            setExpanded(null);
            setFilter(e.target.value);
          }}
          aria-label="종류별 보기"
          className="max-w-[180px] px-2 py-1 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[12px] text-[#3A342A] dark:text-zinc-200"
        >
          <option value="">전체</option>
          <option value="manual">직접 발송</option>
          <option value="auto">자동 메세지 전체</option>
          {AUTO_MESSAGE_CATEGORIES.map((c) => (
            <optgroup key={c.key} label={c.label}>
              {c.triggers.map((t) => (
                <option key={t.key} value={`auto:${t.key}`}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          type="button"
          onClick={() => load(true)}
          className="px-2.5 py-1 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#FBF7EB] dark:hover:bg-zinc-800"
        >
          새로고침
        </button>
        </div>
      </div>

      {loading ? (
        <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : loadError ? (
        <div className="px-4 py-8 text-center text-[12.5px] text-[#B47B2A] dark:text-amber-300 border border-dashed border-[#E8D9B8] dark:border-amber-900/50 rounded-xl">
          {loadError}
        </div>
      ) : logs.length === 0 ? (
        <div className="px-4 py-8 text-center text-[12.5px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
          {filter ? "이 종류로 보낸 기록이 없어요." : "아직 메세지 전송 기록이 없어요."}
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
                      {l.auto_label && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-[#6B7B3A]/10 text-[#6B7B3A] border-[#6B7B3A]/30 dark:bg-[#6B7B3A]/25 dark:text-[#A8B87A]">
                          자동 · {l.auto_label}
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
                    <span className="ml-auto text-[11px] text-[#A89B80]">{isOpen ? "접기 ▲" : "펼치기 ▼"}</span>
                  </div>
                  {/* 누르면 같은 칸이 아래로 펼쳐져 전체 내용이 보인다 (따로 창을 띄우지 않음) */}
                  <div
                    className={`mt-1.5 text-[12.5px] text-[#3A342A] dark:text-zinc-300 whitespace-pre-wrap break-words ${
                      isOpen ? "" : "line-clamp-2"
                    }`}
                  >
                    {l.title ? <strong>[{l.title}] </strong> : null}
                    {l.content}
                  </div>
                  {isTemplateLog(l) && (
                    <div className="mt-1 text-[11.5px] font-medium text-[#6B7B3A] dark:text-[#A8B87A]">
                      ※ 참고: #변수#로 정상문구로 전송되었습니다
                    </div>
                  )}
                </button>

                {isOpen && (
                  <div className="mt-2.5 pt-2.5 border-t border-[#E8E0D0]/70 dark:border-zinc-800 space-y-2 text-[12px] text-[#6B5D47] dark:text-zinc-400">
                    {!isPush && l.result_msg && (
                      <div>
                        <span className="text-[#A89B80]">결과: </span>
                        <span className={failed ? "text-red-600 dark:text-red-400" : ""}>{l.result_msg}</span>
                      </div>
                    )}
                    <div>
                      <div className="mb-1 text-[#A89B80]">받는 사람 {l.receiver_cnt.toLocaleString()}명</div>
                      {l.recipients.length === 0 ? (
                        <div className="text-[#A89B80]">받는 사람 정보가 없어요.</div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                          {l.recipients.map((r, i) => {
                            const label = (
                              <>
                                <span className="font-semibold">{r.name || "회원 아님"}</span>
                                {r.phone && <span className="ml-1 text-[#A89B80]">{formatPhone(r.phone)}</span>}
                              </>
                            );
                            const cls =
                              "inline-flex items-center px-2 py-0.5 rounded-full border border-[#E8E0D0] bg-white text-[11.5px] text-[#3A342A] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200";
                            return r.member_id ? (
                              <Link
                                key={`${r.member_id}-${i}`}
                                href={`/crm/members/${r.member_id}`}
                                className={`${cls} hover:border-[#6B7B3A] hover:underline`}
                              >
                                {label}
                              </Link>
                            ) : (
                              <span key={`${r.phone}-${i}`} className={cls}>
                                {label}
                              </span>
                            );
                          })}
                          {l.receiver_cnt > l.recipients.length && (
                            <span className="inline-flex items-center px-2 py-0.5 text-[11.5px] text-[#A89B80]">
                              외 {(l.receiver_cnt - l.recipients.length).toLocaleString()}명
                            </span>
                          )}
                        </div>
                      )}
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
