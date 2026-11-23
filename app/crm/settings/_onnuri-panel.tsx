"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { crmInputClass } from "../_components/crm-modal";
import { CrmDeniedNotice } from "../_components/crm-denied-notice";

/**
 * 센터설정 › 온누리 결제 — 카운터 공기계(온누리 알림 앱) 연결.
 * 공기계가 하나라도 연결돼야 회원 결제 화면에 '모바일 온누리' 가 나타난다.
 */
type Device = {
  id: number;
  name: string;
  pair_code: string | null;
  pair_code_expires_at: string | null;
  source_package: string | null;
  paired_at: string | null;
  last_seen_at: string | null;
  created_at: string;
};
type Noti = {
  id: number;
  title: string | null;
  body: string | null;
  amount_won: number | null;
  posted_at: string;
  matched_order_id: number | null;
  match_note: string | null;
};

/** 공기계 앱 설치 파일 — public/downloads 에 둔다 */
export const ONNURI_APK_PATH = "/downloads/onnuri-notifier.apk";

const primaryBtn =
  "px-4 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932] disabled:opacity-50";
const ghostBtn =
  "px-3 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12.5px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 disabled:opacity-50";

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString();
  return `${d.slice(5, 10).replace("-", "/")} ${d.slice(11, 16)}`;
}
function ago(iso: string | null): { text: string; stale: boolean } {
  if (!iso) return { text: "신호 없음", stale: true };
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return { text: "방금", stale: false };
  if (min < 60) return { text: `${min}분 전`, stale: min > 40 };
  const h = Math.floor(min / 60);
  return { text: h < 24 ? `${h}시간 전` : `${Math.floor(h / 24)}일 전`, stale: true };
}

export function OnnuriPanel() {
  const { getIdToken } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [notis, setNotis] = useState<Noti[]>([]);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("카운터 공기계");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/onnuri/devices", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.status === 403) {
        setDenied(true);
        return;
      }
      const data = await res.json();
      setDevices(data.devices ?? []);
      setNotis(data.notifications ?? []);
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    load();
    // 연결 코드를 띄워 둔 동안 앱에서 연결됐는지 바로 보이게
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  const call = async (method: "POST" | "DELETE", body?: Record<string, unknown>, qs = "") => {
    setBusy(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/onnuri/devices${qs}`, {
        method,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "처리하지 못했어요");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했어요");
    } finally {
      setBusy(false);
    }
  };

  if (denied) return <CrmDeniedNotice what="온누리 결제 설정" />;
  if (loading) return <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>;

  const active = devices.filter((d) => d.paired_at);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5">
        <h2 className="text-[14px] font-bold text-[#2A251D] dark:text-zinc-100">모바일 온누리 결제 자동 확인</h2>
        <ol className="mt-2 space-y-1 text-[12.5px] leading-relaxed text-[#6B5D47] dark:text-zinc-400 list-decimal pl-4">
          <li>카운터에 둘 <b>안드로이드 공기계</b>에 <b>온누리 가맹점 앱</b>을 깔고 로그인해 두세요.</li>
          <li>
            같은 기기에 <b>온누리 알림 앱</b>을 설치하세요.{" "}
            <a href={ONNURI_APK_PATH} className="font-semibold text-[#6B7B3A] underline">
              설치 파일 받기
            </a>
          </li>
          <li>아래 <b>공기계 연결하기</b>로 6자리 코드를 만들어 앱에 입력하세요.</li>
          <li>앱이 안내하는 대로 <b>알림 접근 허용</b>을 켜고, 알림을 읽을 앱으로 온누리 가맹점 앱을 고르세요.</li>
        </ol>
        <p className="mt-2 text-[12px] text-[#A89B80] leading-relaxed">
          연결되면 회원 결제 화면(홈페이지·회원앱·QR 가입)에 <b>모바일 온누리</b>가 나타나요. 회원이 카운터 QR로 결제하면
          자동으로 이용권이 발급되고, 못 맞춘 건은 10분 뒤 대시보드·회원관리·출석현황 상단과 강사앱으로 알려 드려요.
        </p>
        {active.length === 0 && (
          <p className="mt-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-[12.5px] text-amber-800 dark:text-amber-300">
            아직 연결된 공기계가 없어 회원 결제 화면에 온누리가 보이지 않아요.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5 space-y-3">
        <h3 className="text-[13.5px] font-bold text-[#2A251D] dark:text-zinc-100">공기계</h3>
        {devices.length === 0 ? (
          <p className="text-[12.5px] text-[#A89B80]">등록된 공기계가 없어요.</p>
        ) : (
          <ul className="space-y-2">
            {devices.map((d) => {
              const seen = ago(d.last_seen_at);
              return (
                <li key={d.id} className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[14px] font-bold text-[#2A251D] dark:text-zinc-100">{d.name}</div>
                      <div className="text-[12px] text-[#8C8270]">
                        {d.paired_at ? (
                          <>
                            연결됨 · 마지막 신호{" "}
                            <span className={seen.stale ? "text-red-600 font-semibold" : ""}>{seen.text}</span>
                            {d.source_package ? ` · 읽는 앱 ${d.source_package}` : " · 읽을 앱 미선택"}
                          </>
                        ) : (
                          "연결 대기 중"
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button type="button" disabled={busy} onClick={() => call("POST", { id: d.id, action: "code" })} className={ghostBtn}>
                        {d.paired_at ? "다시 연결" : "새 코드"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`'${d.name}' 연결을 해제할까요? 이 기기는 더 이상 결제 알림을 보내지 못해요.`)) {
                            call("DELETE", undefined, `?id=${d.id}`);
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg border border-red-200 text-[12.5px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        해제
                      </button>
                    </div>
                  </div>
                  {d.pair_code && (
                    <div className="mt-2.5 rounded-lg bg-[#F3F7EA] dark:bg-emerald-950/30 px-3 py-2.5">
                      <div className="text-[11.5px] text-[#4d5a29] dark:text-[#A8B87A]">앱에 입력할 연결 코드 (10분 유효)</div>
                      <div className="text-[30px] font-extrabold tracking-[0.3em] text-[#2A251D] dark:text-zinc-100 tabular-nums">
                        {d.pair_code}
                      </div>
                    </div>
                  )}
                  {d.paired_at && seen.stale && (
                    <p className="mt-2 text-[12px] text-red-600">
                      공기계 신호가 끊겼어요. 전원·와이파이를 확인하고 온누리 알림 앱을 한 번 열어 주세요.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={crmInputClass}
            placeholder="기기 이름 (예: 카운터 공기계)"
            maxLength={40}
          />
          <button type="button" disabled={busy} onClick={() => call("POST", { name })} className={`${primaryBtn} shrink-0`}>
            공기계 연결하기
          </button>
        </div>
        {error && <p className="text-[12.5px] text-red-600">{error}</p>}
      </section>

      <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5">
        <h3 className="text-[13.5px] font-bold text-[#2A251D] dark:text-zinc-100">최근 받은 결제 알림</h3>
        {notis.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-[#A89B80]">아직 받은 알림이 없어요.</p>
        ) : (
          <ul className="mt-2 divide-y divide-[#E8E0D0]/70 dark:divide-zinc-800">
            {notis.map((n) => (
              <li key={n.id} className="py-2 flex items-start gap-3 text-[12.5px]">
                <span className="shrink-0 w-[84px] text-[#8C8270] tabular-nums">{fmt(n.posted_at)}</span>
                <span className="shrink-0 w-[90px] font-bold tabular-nums text-[#2A251D] dark:text-zinc-100">
                  {n.amount_won ? `${n.amount_won.toLocaleString()}원` : "금액 못 읽음"}
                </span>
                <span className="flex-1 min-w-0 text-[#6B5D47] dark:text-zinc-400 truncate">
                  {[n.title, n.body].filter(Boolean).join(" · ")}
                </span>
                <span
                  className={`shrink-0 text-[11.5px] font-semibold ${
                    n.matched_order_id ? "text-emerald-700 dark:text-emerald-400" : "text-[#A89B80]"
                  }`}
                >
                  {n.matched_order_id ? "발급됨" : n.match_note ?? "주문 없음"}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11.5px] text-[#A89B80]">
          &lsquo;주문 없음&rsquo; 은 카운터에서 직원이 직접 받은 온누리 결제일 수 있어요. 그런 결제는 지금처럼 회원권 발급 창에서 결제수단을 기타·온누리로 기록하면 돼요.
        </p>
      </section>
    </div>
  );
}
