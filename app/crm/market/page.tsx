"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { HBar, VBar, ChartCard } from "./_components/bars";

interface Analysis {
  radiusKm: number;
  bizType: string;
  bizTypes: { key: string; label: string }[];
  centerName: string;
  sync: { lastSyncedAt: string | null; inProgress: boolean; progressPage: number; totalPages: number };
  ready: boolean;
  reason?: string;
  center?: { lat: number; lng: number; address: string; sido: string; sigungu: string };
  summary: {
    operating: number;
    within1km: number;
    closed: number;
    closureRate: number;
    /** 폐업률 집계에 포함된 실제 폐업 연도 범위 (누적 기준) */
    closureFromYear: number | null;
    closureToYear: number | null;
    sigunguOpen: number;
    shareOfSigungu: number;
    medianGfa: number | null;
    nearestRival: { name: string | null; distanceKm: number } | null;
  };
  byDistance: { label: string; count: number }[];
  closureByYear: { label: string; count: number }[];
  byCategory: { key: string; label: string; count: number }[];
  byDong: { label: string; count: number }[];
  bySize: { label: string; count: number }[];
  nearest: {
    id: string;
    name: string | null;
    category: string | null;
    address: string | null;
    distanceKm: number;
    gfa: number | null;
    isOpen: boolean;
    closedOn: string | null;
  }[];
}

const RADIUS_OPTIONS = [1, 3, 5];

export default function MarketAnalysisPage() {
  const { getIdToken } = useAuth();
  const [radius, setRadius] = useState(1); // 기본 반경 1km
  const [bizType, setBizType] = useState("gym");
  const [data, setData] = useState<Analysis | null>(null);
  const [locked, setLocked] = useState(false);
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
      const res = await fetch(`/api/crm/market/analysis?radius=${radius}&type=${bizType}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = await res.json();
      if (res.status === 403 && json?.locked) {
        setLocked(true);
        setError(json.error);
        return;
      }
      if (!res.ok) throw new Error(json?.error || "조회 실패");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, radius, bizType]);

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
      setSyncMsg(
        r.error
          ? `오류 — ${r.error}`
          : `${r.fromPage}~${r.toPage}페이지 · 우리 지역 ${r.stored}건 반영` +
            (r.completed ? " · 전국 1회차 완료" : ` · ${r.totalPages}페이지 중 진행 중 (한 번 더 눌러주세요)`)
      );
      await load();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSyncing(false);
    }
  };

  if (locked) {
    return (
      <div className="px-5 md:px-8 py-10 max-w-2xl mx-auto text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#F0EADC] dark:bg-zinc-800 mb-4">
          <LockIcon className="w-7 h-7 text-[#A89B80] dark:text-zinc-500" />
        </div>
        <h1 className="text-[18px] font-bold text-[#2A251D] dark:text-zinc-100">상권분석</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-[#6B5D47] dark:text-zinc-400">{error}</p>
      </div>
    );
  }

  const s = data?.summary;
  const typeLabel =
    data?.bizTypes.find((b) => b.key === bizType)?.label.replace(/\(.*\)/, "").trim() ?? "헬스장";

  return (
    <div className="px-5 md:px-8 pt-2 pb-8 md:pt-3 max-w-6xl mx-auto">
      <header className="mb-4">
        <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">상권분석</h1>
        <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
          내 센터 주변에 경쟁 시설이 얼마나 있고, 시장이 어느 방향으로 움직이는지 봅니다.
          {data?.center?.address && (
            <span className="text-[#A89B80] dark:text-zinc-500"> · 기준 {data.center.address}</span>
          )}
        </p>
      </header>

      {/* 필터 — 차트 위 한 줄 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-[#E8E0D0] dark:border-zinc-700 overflow-hidden">
          {RADIUS_OPTIONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRadius(r)}
              className={`px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                radius === r
                  ? "bg-[#6B7B3A] text-white"
                  : "bg-[#FEFCF7] dark:bg-zinc-900 text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
              }`}
            >
              반경 {r}km
            </button>
          ))}
        </div>
        <select
          value={bizType}
          onChange={(e) => setBizType(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[12.5px] text-[#2A251D] dark:text-zinc-100"
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
          {syncing ? "수집 중…" : data?.sync.inProgress ? "이어서 수집" : "데이터 갱신"}
        </button>
      </div>
      {syncMsg && <p className="mb-3 text-[12px] text-[#4d5a29] dark:text-[#A8B87A]">{syncMsg}</p>}

      {data?.sync.inProgress && (
        <div className="mb-4 rounded-xl border border-[#5A8BB0]/40 bg-[#5A8BB0]/[0.07] px-4 py-3 text-[12.5px] text-[#6B5D47] dark:text-zinc-300">
          🔄 전국 목록을 나눠 받는 중 — {data.sync.totalPages}페이지 중 {data.sync.progressPage}페이지 완료.
          아직 일부만 반영된 숫자예요.
        </div>
      )}
      {error && !locked && (
        <div className="mb-4 px-4 py-3 rounded-xl border border-dashed border-[#E8E0D0] dark:border-zinc-700 text-[13px] text-[#8C8270]">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="py-16 text-center text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : data && data.ready && s ? (
        <div className="space-y-3.5">
          {/* ── 핵심 숫자 4개 ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <Tile
              label={`반경 ${data.radiusKm}km ${typeLabel}`}
              value={s.operating}
              unit="곳"
              sub={`1km 안에는 ${s.within1km}곳`}
              accent
            />
            <Tile
              label="가장 가까운 경쟁"
              value={s.nearestRival ? s.nearestRival.distanceKm * 1000 : 0}
              unit="m"
              decimals={0}
              sub={s.nearestRival?.name ?? "반경 내 없음"}
            />
            <Tile
              label="이 상권 폐업률"
              value={s.closureRate}
              unit="%"
              decimals={1}
              sub={`등록 ${s.operating + s.closed}곳 중 ${s.closed}곳 폐업${
                s.closureFromYear && s.closureToYear
                  ? ` · ${s.closureFromYear}~${s.closureToYear}년 누적`
                  : ""
              }`}
              warn={s.closureRate >= 30}
            />
            <Tile
              label={`${data.center?.sigungu ?? "시군구"} 내 비중`}
              value={s.shareOfSigungu}
              unit="%"
              decimals={1}
              sub={`${data.center?.sigungu ?? ""} 전체 ${s.sigunguOpen}곳`}
            />
          </div>

          {/* ── 시장 흐름 ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <ChartCard
              title="거리별 경쟁 밀도"
              hint={`가까울수록 직접 경쟁입니다 · ${typeLabel} 영업 중 기준`}
            >
              <VBar data={data.byDistance} />
            </ChartCard>
            <ChartCard
              title="연도별 폐업 수 (최근 6년)"
              hint="문 닫은 곳이 늘면 상권이 어려워진다는 신호예요"
            >
              <VBar data={data.closureByYear} />
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <ChartCard
              title={`반경 ${data.radiusKm}km 업종 구성`}
              hint="헬스장 외 업종도 회원의 시간을 두고 경쟁합니다"
            >
              <HBar data={data.byCategory.map((c) => ({ label: c.label, count: c.count }))} />
            </ChartCard>
            <ChartCard title="동별 밀집도" hint={`${typeLabel}이 어느 동에 몰려 있는지`}>
              <HBar data={data.byDong} />
            </ChartCard>
          </div>

          <ChartCard
            title="경쟁 시설 규모 분포"
            hint={
              s.medianGfa
                ? `연면적 기준 · 주변 ${typeLabel} 중간값 ${s.medianGfa.toLocaleString()}㎡`
                : "연면적 기준"
            }
          >
            <HBar data={data.bySize} />
          </ChartCard>

          {/* ── 가까운 경쟁 목록 ── */}
          <section className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 overflow-hidden">
            <div className="px-4 py-2.5 bg-[#FBF7EB]/60 dark:bg-zinc-900/60 border-b border-[#E8E0D0] dark:border-zinc-800">
              <h3 className="text-[13px] font-bold text-[#2A251D] dark:text-zinc-100">
                가까운 {typeLabel} ({data.nearest.length}곳)
              </h3>
            </div>
            {data.nearest.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12.5px] text-[#8C8270] dark:text-zinc-500">
                반경 내 시설이 없어요.
              </div>
            ) : (
              <ul className="divide-y divide-[#E8E0D0] dark:divide-zinc-800 max-h-[440px] overflow-y-auto">
                {data.nearest.map((f) => (
                  <li key={f.id} className="px-4 py-2.5 flex items-center gap-3">
                    <span className="w-[52px] shrink-0 text-[12.5px] font-bold tabular-nums text-[#4d5a29] dark:text-[#A8B87A]">
                      {f.distanceKm < 1
                        ? `${Math.round(f.distanceKm * 1000)}m`
                        : `${f.distanceKm.toFixed(1)}km`}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-[#2A251D] dark:text-zinc-100 truncate">
                        {f.name || "(이름 없음)"}
                        {!f.isOpen && (
                          <span className="ml-1.5 text-[11px] font-medium text-[#B4442A] dark:text-red-300">
                            폐업{f.closedOn ? ` ${f.closedOn.slice(0, 7)}` : ""}
                          </span>
                        )}
                      </div>
                      <div className="text-[11.5px] text-[#8C8270] dark:text-zinc-500 truncate">
                        {f.address}
                      </div>
                    </div>
                    {f.gfa ? (
                      <span className="shrink-0 text-[11.5px] tabular-nums text-[#6B5D47] dark:text-zinc-400">
                        {Math.round(f.gfa).toLocaleString()}㎡
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── 출처·한계 ── */}
          <div className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FBF7EB]/40 dark:bg-zinc-900/40 px-4 py-3 text-[11.5px] leading-relaxed text-[#6B5D47] dark:text-zinc-400">
            출처: <strong>국민체육진흥공단 전국체육시설 정보</strong> (공공데이터포털)
            {data.sync.lastSyncedAt && ` · 마지막 갱신 ${data.sync.lastSyncedAt.slice(0, 10)}`}
            <div className="mt-1 text-[#A89B80] dark:text-zinc-500">
              ⚠️ 이 데이터에는 <strong>개업일이 없어</strong> &lsquo;언제 생겼는지&rsquo;는 알 수 없습니다.
              폐업일은 원본 값이라 과거분도 정확해요.
              <br />
              ⚠️ 필라테스·요가는 체육시설업 신고 대상이 아니라(자유업) 집계에 빠집니다. 크로스핏은 보통
              체력단련장업으로 등록돼 포함됩니다.
            </div>
          </div>
        </div>
      ) : data && !data.ready ? (
        <div className="rounded-xl border border-[#B47B2A]/40 bg-[#B47B2A]/[0.07] px-4 py-3 text-[12.5px] text-[#6B5D47] dark:text-zinc-300">
          <strong className="text-[#B47B2A] dark:text-amber-300">기준점을 못 잡았어요.</strong> {data.reason}
        </div>
      ) : null}
    </div>
  );
}

/** 핵심 숫자 타일 — 막대 하나짜리 차트 대신 숫자가 곧 차트 */
function Tile({
  label,
  value,
  unit,
  sub,
  decimals = 0,
  accent,
  warn,
}: {
  label: string;
  value: number;
  unit: string;
  sub?: string;
  decimals?: number;
  accent?: boolean;
  warn?: boolean;
}) {
  const color = warn
    ? "text-[#B4442A] dark:text-red-300"
    : accent
      ? "text-[#4d5a29] dark:text-[#A8B87A]"
      : "text-[#2A251D] dark:text-zinc-100";
  return (
    <div className="rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 px-4 py-3">
      <div className="text-[11.5px] text-[#8C8270] dark:text-zinc-500 truncate">{label}</div>
      <div className={`mt-1 text-[24px] leading-none font-bold tabular-nums ${color}`}>
        {value.toLocaleString(undefined, { maximumFractionDigits: decimals })}
        <span className="ml-0.5 text-[13px] font-semibold text-[#8C8270] dark:text-zinc-500">{unit}</span>
      </div>
      {sub && (
        <div className="mt-1.5 text-[11px] text-[#A89B80] dark:text-zinc-600 truncate" title={sub}>
          {sub}
        </div>
      )}
    </div>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <rect x="4" y="10" width="16" height="10" rx="2.5" />
      <path d="M8 10V7a4 4 0 1 1 8 0v3" strokeLinecap="round" />
    </svg>
  );
}
