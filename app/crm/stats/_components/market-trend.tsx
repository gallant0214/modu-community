"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { CrmMultiLineChart, LineSeries } from "../../_components/crm-multi-line-chart";

interface Resp {
  radiusKm: number;
  months: number;
  bizType: string;
  bizTypes: { key: string; label: string }[];
  keys: { dataGoKr: boolean; kakao: boolean };
  center:
    | { ready: true; lat: number; lng: number; address: string; sido: string; sigungu: string }
    | { ready: false; address: string; reason: string };
  summary: { registered: number; opened: number; closed: number; net: number };
  monthLabels: string[];
  series: { opened: number[]; closed: number[] };
  list: {
    mgtNo: string;
    name: string | null;
    address: string | null;
    distanceKm: number;
    openedOn: string | null;
    closedOn: string | null;
    isOpen: boolean;
  }[];
  coverage: { total: number; geocoded: number; pending: number; failed: number };
  lastSyncedAt: string | null;
}

const RADIUS_OPTIONS = [1, 3, 5];
const MONTH_OPTIONS = [12, 24, 36];

/**
 * 상권 동향 — 센터 반경 내 경쟁업체(헬스장) 신규 개업·폐업 추이.
 * 출처: 행정안전부 지방행정 인허가 데이터(LOCALDATA) 체육시설업.
 */
export function MarketTrend() {
  const { getIdToken } = useAuth();
  const [radius, setRadius] = useState(3);
  const [months, setMonths] = useState(12);
  const [bizType, setBizType] = useState("gym");
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch(
        `/api/crm/market/nearby?radius=${radius}&months=${months}&type=${bizType}`,
        { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "조회 실패");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, radius, months, bizType]);

  useEffect(() => {
    load();
  }, [load]);

  const runSync = async () => {
    setSyncing(true);
    setSyncMsg("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/market/sync", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ months: 24, maxPages: 20, geocodeLimit: 300 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "수집 실패");
      const reports = (json.reports ?? []) as {
        fetched?: number;
        diagnostics?: { requestedUrl?: string; httpStatus?: number; apiMessage?: string };
      }[];
      const fetched = reports.reduce((a, r) => a + (r.fetched ?? 0), 0);
      if (fetched === 0) {
        // 아무것도 못 받았을 때는 원인을 그대로 보여준다(엔드포인트·활용신청 확인용)
        const d = reports[0]?.diagnostics;
        setSyncMsg(
          `0건 — ${d?.apiMessage || "응답에 업소 데이터가 없습니다"}` +
            (d?.httpStatus ? ` (HTTP ${d.httpStatus})` : "") +
            (d?.requestedUrl ? `\n요청: ${d.requestedUrl}` : "")
        );
      } else {
        setSyncMsg(
          `수집 ${fetched}건 · 좌표 확보 ${json.geocode?.ok ?? 0}건` +
            (json.geocode?.skipped ? " (카카오 키 미설정으로 좌표 변환 생략)" : "")
        );
      }
      await load();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSyncing(false);
    }
  };

  const series: LineSeries[] = data
    ? [
        { label: "신규 개업", color: "#6B7B3A", values: data.series.opened },
        { label: "폐업", color: "#C76C8E", values: data.series.closed },
      ]
    : [];

  const keysMissing = data && (!data.keys.dataGoKr || !data.keys.kakao);

  return (
    <div className="space-y-4">
      {/* 조건 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-semibold text-[#6B5D47] dark:text-zinc-400">반경</span>
        <div className="inline-flex rounded-lg border border-[#E8E0D0] dark:border-zinc-700 overflow-hidden">
          {RADIUS_OPTIONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRadius(r)}
              className={`px-3 py-1.5 text-[12.5px] font-semibold ${
                radius === r
                  ? "bg-[#6B7B3A] text-white"
                  : "bg-[#FEFCF7] dark:bg-zinc-900 text-[#6B5D47] dark:text-zinc-300"
              }`}
            >
              {r}km
            </button>
          ))}
        </div>
        <span className="ml-2 text-[12.5px] font-semibold text-[#6B5D47] dark:text-zinc-400">기간</span>
        <div className="inline-flex rounded-lg border border-[#E8E0D0] dark:border-zinc-700 overflow-hidden">
          {MONTH_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMonths(m)}
              className={`px-3 py-1.5 text-[12.5px] font-semibold ${
                months === m
                  ? "bg-[#6B7B3A] text-white"
                  : "bg-[#FEFCF7] dark:bg-zinc-900 text-[#6B5D47] dark:text-zinc-300"
              }`}
            >
              {m}개월
            </button>
          ))}
        </div>
        {(data?.bizTypes?.length ?? 0) > 1 && (
          <select
            value={bizType}
            onChange={(e) => setBizType(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[12.5px]"
          >
            {data?.bizTypes.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={runSync}
          disabled={syncing}
          className="ml-auto px-3 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12.5px] font-semibold text-[#6B5D47] dark:text-zinc-300 bg-[#FEFCF7] dark:bg-zinc-900 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          {syncing ? "수집 중…" : "지금 수집"}
        </button>
      </div>
      {syncMsg && (
        <p className="text-[12px] whitespace-pre-wrap break-all text-[#4d5a29] dark:text-[#A8B87A]">
          {syncMsg}
        </p>
      )}

      {/* 준비 안 된 상태 안내 */}
      {keysMissing && (
        <div className="rounded-xl border border-[#B47B2A]/40 bg-[#B47B2A]/[0.07] px-4 py-3 text-[12.5px] leading-relaxed text-[#6B5D47] dark:text-zinc-300">
          <strong className="text-[#B47B2A] dark:text-amber-300">설정이 더 필요해요.</strong>
          <ul className="mt-1.5 space-y-0.5 list-disc pl-4">
            {!data?.keys.dataGoKr && (
              <li>
                <code>DATA_GO_KR_KEY</code> 미설정 — 인허가 데이터를 받아올 수 없습니다.
              </li>
            )}
            {!data?.keys.kakao && (
              <li>
                <code>KAKAO_REST_API_KEY</code> 미설정 — 주소를 좌표로 바꿀 수 없어 반경 계산이 안 됩니다.
              </li>
            )}
          </ul>
        </div>
      )}
      {data && !data.center.ready && (
        <div className="rounded-xl border border-[#B47B2A]/40 bg-[#B47B2A]/[0.07] px-4 py-3 text-[12.5px] leading-relaxed text-[#6B5D47] dark:text-zinc-300">
          <strong className="text-[#B47B2A] dark:text-amber-300">반경 기준점을 못 잡았어요.</strong>{" "}
          {data.center.reason}
          {!data.center.address && " — 설정 > 센터 정보에서 주소를 먼저 등록해 주세요."}
        </div>
      )}

      {error && (
        <div className="px-4 py-6 text-center text-[13px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-2xl">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="px-4 py-10 text-center text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : data ? (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <SummaryCard
              label={`반경 ${data.radiusKm}km 영업 중`}
              value={data.summary.registered}
              unit="곳"
              hint="수집된 인허가 기준"
            />
            <SummaryCard
              label={`최근 ${data.months}개월 신규`}
              value={data.summary.opened}
              unit="곳"
              tone="up"
            />
            <SummaryCard
              label={`최근 ${data.months}개월 폐업`}
              value={data.summary.closed}
              unit="곳"
              tone="down"
            />
            <SummaryCard
              label="순증감"
              value={data.summary.net}
              unit="곳"
              tone={data.summary.net > 0 ? "up" : data.summary.net < 0 ? "down" : undefined}
              signed
            />
          </div>

          {/* 추이 차트 */}
          <div className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-3">
            <div className="flex items-center gap-3 mb-1 px-1">
              <h4 className="text-[13px] font-bold text-[#2A251D] dark:text-zinc-100">
                월별 개업·폐업 추이
              </h4>
              <div className="flex items-center gap-2.5 text-[11.5px] text-[#6B5D47] dark:text-zinc-400">
                <span className="inline-flex items-center gap-1">
                  <i className="w-2.5 h-2.5 rounded-full bg-[#6B7B3A]" /> 신규 개업
                </span>
                <span className="inline-flex items-center gap-1">
                  <i className="w-2.5 h-2.5 rounded-full bg-[#C76C8E]" /> 폐업
                </span>
              </div>
            </div>
            <CrmMultiLineChart months={data.monthLabels} series={series} unit="곳" />
          </div>

          {/* 신규 개업 목록 */}
          <div className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 overflow-hidden">
            <div className="px-3.5 py-2.5 bg-[#FBF7EB]/60 dark:bg-zinc-900/60 border-b border-[#E8E0D0] dark:border-zinc-800">
              <h4 className="text-[13px] font-bold text-[#2A251D] dark:text-zinc-100">
                최근 {data.months}개월 신규 개업 ({data.list.length}곳)
              </h4>
            </div>
            {data.list.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12.5px] text-[#8C8270] dark:text-zinc-500">
                해당 조건에 잡힌 신규 개업 업소가 없어요.
              </div>
            ) : (
              <ul className="divide-y divide-[#E8E0D0] dark:divide-zinc-800">
                {data.list.map((f) => (
                  <li key={f.mgtNo} className="px-3.5 py-2.5 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-[#2A251D] dark:text-zinc-100 truncate">
                        {f.name || "(상호 없음)"}
                        {!f.isOpen && (
                          <span className="ml-1.5 text-[11px] font-medium text-[#C76C8E]">폐업</span>
                        )}
                      </div>
                      <div className="text-[11.5px] text-[#8C8270] dark:text-zinc-500 truncate">
                        {f.address}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[12.5px] font-semibold text-[#4d5a29] dark:text-[#A8B87A]">
                        {f.distanceKm}km
                      </div>
                      <div className="text-[11px] text-[#8C8270] dark:text-zinc-500">
                        {f.openedOn} 개업
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 출처·한계 */}
          <div className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FBF7EB]/40 dark:bg-zinc-900/40 px-4 py-3 text-[11.5px] leading-relaxed text-[#6B5D47] dark:text-zinc-400">
            <div>
              출처: <strong>행정안전부 생활 체력단련장업 조회서비스 (공공데이터포털)</strong>
              {data.lastSyncedAt && ` · 마지막 수집 ${data.lastSyncedAt.slice(0, 10)}`}
              {` · 좌표 확보 ${data.coverage.geocoded}/${data.coverage.total}건`}
              {data.coverage.pending > 0 && ` (대기 ${data.coverage.pending}건)`}
            </div>
            <div className="mt-1 text-[#A89B80] dark:text-zinc-500">
              ⚠️ 소규모 PT샵·필라테스는 체육시설업 신고 없이 자유업으로 등록되는 경우가 있어 실제보다
              적게 잡힐 수 있어요. 인허가일과 실제 개업일에도 시차가 있을 수 있습니다.
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  unit,
  hint,
  tone,
  signed,
}: {
  label: string;
  value: number;
  unit: string;
  hint?: string;
  tone?: "up" | "down";
  signed?: boolean;
}) {
  const color =
    tone === "up"
      ? "text-[#B4442A] dark:text-red-300"
      : tone === "down"
        ? "text-[#4d5a29] dark:text-[#A8B87A]"
        : "text-[#2A251D] dark:text-zinc-100";
  return (
    <div className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 px-3.5 py-3">
      <div className="text-[11.5px] text-[#8C8270] dark:text-zinc-500">{label}</div>
      <div className={`mt-1 text-[20px] font-bold ${color}`}>
        {signed && value > 0 ? "+" : ""}
        {value}
        <span className="ml-0.5 text-[12px] font-semibold text-[#8C8270] dark:text-zinc-500">
          {unit}
        </span>
      </div>
      {hint && <div className="mt-0.5 text-[10.5px] text-[#A89B80] dark:text-zinc-600">{hint}</div>}
    </div>
  );
}
