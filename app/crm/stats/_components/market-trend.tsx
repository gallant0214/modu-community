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
  sync: {
    lastSyncedAt: string | null;
    inProgress: boolean;
    progressPage: number;
    totalPages: number;
  };
  center:
    | { ready: true; lat: number; lng: number; address: string; sido: string; sigungu: string }
    | { ready: false; address: string; reason: string };
  summary: { operating: number; newlySeen: number; closed: number; net: number };
  monthLabels: string[];
  series: { newlySeen: number[]; closed: number[] };
  list: {
    id: string;
    name: string | null;
    category: string | null;
    address: string | null;
    distanceKm: number;
    closedOn: string | null;
    isOpen: boolean;
  }[];
  byType: { key: string; label: string; count: number }[];
}

const RADIUS_OPTIONS = [1, 3, 5];
const MONTH_OPTIONS = [12, 24, 36];

/**
 * 상권 동향 — 센터 반경 내 경쟁 체육시설 현황.
 * 출처: 서울올림픽기념국민체육진흥공단_전국체육시설 정보 (공공데이터포털).
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
        body: JSON.stringify({ maxPages: 60 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "수집 실패");
      const r = json.report ?? {};
      if (r.error) {
        setSyncMsg(`오류 — ${r.error}`);
      } else {
        setSyncMsg(
          `${r.fromPage}~${r.toPage}페이지 조회 · 우리 지역 ${r.stored}건 저장 (신규 ${r.added}건)` +
            (r.completed
              ? " · 전국 1회차 수집 완료"
              : ` · 전체 ${r.totalPages}페이지 중 진행 중 — 버튼을 한 번 더 눌러 이어받으세요`)
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
        { label: "신규 확인", color: "#6B7B3A", values: data.series.newlySeen },
        { label: "폐업", color: "#C76C8E", values: data.series.closed },
      ]
    : [];

  const keysMissing = data && (!data.keys.dataGoKr || !data.keys.kakao);
  const noData = data?.center.ready && data.summary.operating === 0 && data.list.length === 0;

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
        <span className="ml-1 text-[12.5px] font-semibold text-[#6B5D47] dark:text-zinc-400">기간</span>
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
        <select
          value={bizType}
          onChange={(e) => setBizType(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[12.5px]"
        >
          {(data?.bizTypes ?? [{ key: "gym", label: "헬스장(체력단련장업)" }]).map((b) => (
            <option key={b.key} value={b.key}>
              {b.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={runSync}
          disabled={syncing}
          className="ml-auto px-3 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12.5px] font-semibold text-[#6B5D47] dark:text-zinc-300 bg-[#FEFCF7] dark:bg-zinc-900 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          {syncing ? "수집 중…" : data?.sync.inProgress ? "이어서 수집" : "지금 수집"}
        </button>
      </div>
      {syncMsg && (
        <p className="text-[12px] whitespace-pre-wrap break-all text-[#4d5a29] dark:text-[#A8B87A]">
          {syncMsg}
        </p>
      )}

      {keysMissing && (
        <div className="rounded-xl border border-[#B47B2A]/40 bg-[#B47B2A]/[0.07] px-4 py-3 text-[12.5px] leading-relaxed text-[#6B5D47] dark:text-zinc-300">
          <strong className="text-[#B47B2A] dark:text-amber-300">설정이 더 필요해요.</strong>
          <ul className="mt-1.5 space-y-0.5 list-disc pl-4">
            {!data?.keys.dataGoKr && (
              <li>
                <code>DATA_GO_KR_KEY</code> 미설정 — 시설 데이터를 받아올 수 없습니다.
              </li>
            )}
            {!data?.keys.kakao && (
              <li>
                <code>KAKAO_REST_API_KEY</code> 미설정 — 센터 주소를 좌표로 바꿀 수 없습니다.
              </li>
            )}
          </ul>
        </div>
      )}
      {data && !data.center.ready && (
        <div className="rounded-xl border border-[#B47B2A]/40 bg-[#B47B2A]/[0.07] px-4 py-3 text-[12.5px] leading-relaxed text-[#6B5D47] dark:text-zinc-300">
          <strong className="text-[#B47B2A] dark:text-amber-300">반경 기준점을 못 잡았어요.</strong>{" "}
          {data.center.reason}
        </div>
      )}
      {data?.sync.inProgress && (
        <div className="rounded-xl border border-[#5A8BB0]/40 bg-[#5A8BB0]/[0.07] px-4 py-3 text-[12.5px] leading-relaxed text-[#6B5D47] dark:text-zinc-300">
          🔄 전국 목록을 나눠 받는 중입니다 — <strong>{data.sync.totalPages}페이지 중 {data.sync.progressPage}페이지</strong>까지
          완료. 아직 일부만 반영된 숫자예요. 위 <strong>&lsquo;이어서 수집&rsquo;</strong> 버튼을 다 끝날 때까지 눌러주세요.
        </div>
      )}
      {noData && !data?.sync.inProgress && !data?.sync.lastSyncedAt && (
        <div className="rounded-xl border border-dashed border-[#E8E0D0] dark:border-zinc-700 px-4 py-6 text-center text-[12.5px] text-[#8C8270] dark:text-zinc-500">
          아직 수집된 시설 데이터가 없어요. 우측 상단 <strong>&lsquo;지금 수집&rsquo;</strong> 버튼을 눌러주세요.
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <SummaryCard label={`반경 ${data.radiusKm}km 영업 중`} value={data.summary.operating} unit="곳" />
            <SummaryCard
              label={`최근 ${data.months}개월 신규 확인`}
              value={data.summary.newlySeen}
              unit="곳"
              tone="up"
              hint="수집 시작 이후 기준"
            />
            <SummaryCard label={`최근 ${data.months}개월 폐업`} value={data.summary.closed} unit="곳" tone="down" />
            <SummaryCard
              label="순증감"
              value={data.summary.net}
              unit="곳"
              signed
              tone={data.summary.net > 0 ? "up" : data.summary.net < 0 ? "down" : undefined}
            />
          </div>

          {/* 업종별 분포 */}
          {data.byType.length > 0 && (
            <div className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 px-3.5 py-3">
              <h4 className="text-[13px] font-bold text-[#2A251D] dark:text-zinc-100 mb-2">
                반경 {data.radiusKm}km 업종별 (영업 중)
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {data.byType.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setBizType(t.key)}
                    className={`px-2.5 py-1 rounded-full text-[12px] font-semibold border ${
                      t.key === data.bizType
                        ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
                        : "border-[#E8E0D0] dark:border-zinc-700 text-[#6B5D47] dark:text-zinc-300"
                    }`}
                  >
                    {t.label.replace(/\(.*\)/, "")} {t.count}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-3">
            <div className="flex items-center gap-3 mb-1 px-1 flex-wrap">
              <h4 className="text-[13px] font-bold text-[#2A251D] dark:text-zinc-100">월별 추이</h4>
              <div className="flex items-center gap-2.5 text-[11.5px] text-[#6B5D47] dark:text-zinc-400">
                <span className="inline-flex items-center gap-1">
                  <i className="w-2.5 h-2.5 rounded-full bg-[#6B7B3A]" /> 신규 확인
                </span>
                <span className="inline-flex items-center gap-1">
                  <i className="w-2.5 h-2.5 rounded-full bg-[#C76C8E]" /> 폐업
                </span>
              </div>
            </div>
            <CrmMultiLineChart months={data.monthLabels} series={series} unit="곳" />
          </div>

          <div className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 overflow-hidden">
            <div className="px-3.5 py-2.5 bg-[#FBF7EB]/60 dark:bg-zinc-900/60 border-b border-[#E8E0D0] dark:border-zinc-800">
              <h4 className="text-[13px] font-bold text-[#2A251D] dark:text-zinc-100">
                반경 {data.radiusKm}km 목록 ({data.list.length}곳) · 가까운 순
              </h4>
            </div>
            {data.list.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12.5px] text-[#8C8270] dark:text-zinc-500">
                해당 조건에 잡힌 시설이 없어요.
              </div>
            ) : (
              <ul className="divide-y divide-[#E8E0D0] dark:divide-zinc-800 max-h-[520px] overflow-y-auto">
                {data.list.map((f) => (
                  <li key={f.id} className="px-3.5 py-2.5 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-[#2A251D] dark:text-zinc-100 truncate">
                        {f.name || "(이름 없음)"}
                        {f.category && (
                          <span className="ml-1.5 text-[11px] font-medium text-[#8C8270] dark:text-zinc-500">
                            {f.category}
                          </span>
                        )}
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
                      {f.closedOn && (
                        <div className="text-[11px] text-[#8C8270] dark:text-zinc-500">{f.closedOn} 폐업</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FBF7EB]/40 dark:bg-zinc-900/40 px-4 py-3 text-[11.5px] leading-relaxed text-[#6B5D47] dark:text-zinc-400">
            <div>
              출처: <strong>국민체육진흥공단 전국체육시설 정보</strong> (공공데이터포털)
              {data.sync.lastSyncedAt && ` · 마지막 수집 ${data.sync.lastSyncedAt.slice(0, 10)}`}
            </div>
            <div className="mt-1 text-[#A89B80] dark:text-zinc-500">
              ⚠️ 이 데이터에는 <strong>개업일이 없습니다.</strong> &lsquo;신규 확인&rsquo;은 개업일이 아니라
              <strong> 우리가 수집을 시작한 뒤 처음 확인된 시점</strong> 기준이라, 쌓일수록 정확해집니다.
              폐업일은 원본 값이라 과거분도 정확해요.
              <br />
              ⚠️ 필라테스·요가는 체육시설업 신고 대상이 아니라(자유업) 이 데이터에 잡히지 않습니다.
              크로스핏은 보통 체력단련장업으로 등록됩니다.
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
        <span className="ml-0.5 text-[12px] font-semibold text-[#8C8270] dark:text-zinc-500">{unit}</span>
      </div>
      {hint && <div className="mt-0.5 text-[10.5px] text-[#A89B80] dark:text-zinc-600">{hint}</div>}
    </div>
  );
}
