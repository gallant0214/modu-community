"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { CrmModal, CrmField, crmInputClass } from "../_components/crm-modal";
import { formatPhone } from "../_components/crm-labels";
import { MemberQuickModal } from "../_components/member-quick-modal";

type Tab = "assigned" | "unassigned" | "returns" | "settings";
type ViewMode = "compact" | "box" | "list";

const ZONE_COUNT = 8;
const ZONE_NAME_MAX = 6;
const EXPIRING_DAYS = 7; // 만료 임박 N일

type LockerState = "unassigned" | "assigned" | "broken";
type DisplayState = "unassigned" | "active" | "expiring" | "reserved" | "expired" | "broken";

interface Zone {
  zone_number: number;
  name: string;
  locker_count: number;
  start_number: number;
  layout_rows?: number;
  layout_cols?: number;
}
interface Locker {
  id: number;
  number: number;
  state: LockerState;
  assigned_member_id: number | null;
  start_date: string | null;
  expires_at: string | null;
  password: string | null;
  memo: string | null;
  layout_row: number | null;
  layout_col: number | null;
  member: { id: number; name: string; phone: string | null; face_image_thumb?: string | null } | null;
}

const STATE_FILTERS: { key: "all" | DisplayState; label: string; color: string }[] = [
  { key: "all",        label: "전체",    color: "bg-[#B47B2A] text-white" },
  { key: "active",     label: "활성",    color: "bg-emerald-500 text-white" },
  { key: "expiring",   label: "임박",    color: "bg-red-500 text-white" },
  { key: "reserved",   label: "예정",    color: "bg-amber-400 text-[#3A342A]" },
  { key: "unassigned", label: "미배정",  color: "bg-[#A89B80] text-white" },
  { key: "expired",    label: "만료",    color: "bg-[#8C8270] text-white" },
  { key: "broken",     label: "고장",    color: "bg-zinc-700 text-white" },
];

function getDisplayState(l: Locker, today: string): DisplayState {
  if (l.state === "broken") return "broken";
  if (l.state === "unassigned") return "unassigned";
  if (!l.expires_at) return "active";
  if (l.start_date && l.start_date > today) return "reserved";
  if (l.expires_at < today) return "expired";
  const t = new Date(today).getTime();
  const e = new Date(l.expires_at).getTime();
  const diffDays = Math.floor((e - t) / (24 * 3600 * 1000));
  if (diffDays <= EXPIRING_DAYS) return "expiring";
  return "active";
}

function daysUntil(date: string, today: string): number {
  return Math.ceil((new Date(date).getTime() - new Date(today).getTime()) / (24 * 3600 * 1000));
}

const STATE_LABEL: Record<DisplayState, string> = {
  active: "활성",
  expiring: "임박",
  reserved: "예정",
  unassigned: "미배정",
  expired: "만료",
  broken: "고장",
};
const STATE_CHIP_CLS: Record<DisplayState, string> = {
  active:     "bg-emerald-500 text-white dark:bg-emerald-500 dark:text-white",
  expiring:   "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  reserved:   "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  unassigned: "bg-[#F5F0E5] text-[#A89B80] dark:bg-zinc-800 dark:text-zinc-400",
  expired:    "bg-[#F5F0E5] text-[#8C8270] dark:bg-zinc-800 dark:text-zinc-500",
  broken:     "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300",
};

export default function CrmLockersPage() {
  const { getIdToken } = useAuth();
  const [tab, setTab] = useState<Tab>("assigned");
  const [zone, setZone] = useState<number>(1);
  const [zones, setZones] = useState<Zone[]>([]);
  const [lockers, setLockers] = useState<Locker[]>([]);
  const [loadingZones, setLoadingZones] = useState(true);
  const [loadingLockers, setLoadingLockers] = useState(false);
  const [error, setError] = useState("");
  // KST 기준 오늘 (UTC 로 계산하면 새벽·저녁대에 D-day/임박 판정이 하루씩 밀림)
  const [today] = useState(() => {
    const d = new Date();
    const kst = new Date(d.getTime() + 9 * 3600 * 1000);
    return kst.toISOString().slice(0, 10);
  });

  // 필터
  const [filter, setFilter] = useState<"all" | DisplayState>("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("box");
  const [pickedLocker, setPickedLocker] = useState<Locker | null>(null);
  const [moveSource, setMoveSource] = useState<Locker | null>(null);

  // 데스크탑 감지 (lg = 1024px). 데스크탑에서는 우측 슬라이드 패널, 모바일에서는 모달.
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1024px)");
    const handler = () => setIsDesktop(m.matches);
    handler();
    m.addEventListener("change", handler);
    return () => m.removeEventListener("change", handler);
  }, []);

  // 설정 폼
  const [zoneName, setZoneName] = useState("");
  const [lockerCount, setLockerCount] = useState("");
  const [startNumber, setStartNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  // 배치도 편집 상태
  const [layoutEditMode, setLayoutEditMode] = useState(false);
  const [layoutRows, setLayoutRows] = useState(0);
  const [layoutCols, setLayoutCols] = useState(0);
  const [layoutMap, setLayoutMap] = useState<Record<number, { row: number; col: number } | null>>(
    {}
  );
  const [pickedForPlace, setPickedForPlace] = useState<number | null>(null);
  const [savingLayout, setSavingLayout] = useState(false);

  const loadZones = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch("/api/crm/lockers/zones", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setZones(data.zones ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoadingZones(false);
    }
  }, [getIdToken]);

  const loadLockers = useCallback(async () => {
    setLoadingLockers(true);
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch(`/api/crm/lockers?zone=${zone}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setLockers(data.lockers ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoadingLockers(false);
    }
  }, [getIdToken, zone]);

  useEffect(() => {
    loadZones();
  }, [loadZones]);

  useEffect(() => {
    if (tab === "assigned" || tab === "settings") loadLockers();
  }, [tab, zone, loadLockers]);

  const currentZone = useMemo(
    () => zones.find((z) => z.zone_number === zone),
    [zones, zone]
  );

  useEffect(() => {
    if (currentZone) {
      setZoneName(currentZone.name);
      setLockerCount(String(currentZone.locker_count));
      setStartNumber(String(currentZone.start_number));
      setLayoutRows(currentZone.layout_rows ?? 0);
      setLayoutCols(currentZone.layout_cols ?? 0);
    } else {
      setZoneName(`구역 ${zone}`);
      setLockerCount("");
      setStartNumber("");
      setLayoutRows(0);
      setLayoutCols(0);
    }
    setSavedMsg("");
    setLayoutEditMode(false);
    setPickedForPlace(null);
  }, [currentZone, zone]);

  // 락커 로드 시 layoutMap 동기화
  useEffect(() => {
    const map: Record<number, { row: number; col: number } | null> = {};
    for (const l of lockers) {
      if (l.layout_row !== null && l.layout_col !== null) {
        map[l.id] = { row: l.layout_row, col: l.layout_col };
      } else {
        map[l.id] = null;
      }
    }
    setLayoutMap(map);
  }, [lockers]);

  const zoneLabel = useCallback(
    (n: number) => zones.find((z) => z.zone_number === n)?.name ?? `구역 ${n}`,
    [zones]
  );

  // 상태별 카운트
  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: lockers.length,
      active: 0,
      expiring: 0,
      reserved: 0,
      unassigned: 0,
      expired: 0,
      broken: 0,
    };
    for (const l of lockers) {
      const s = getDisplayState(l, today);
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [lockers, today]);

  // 필터 + 검색 적용된 락커
  const filtered = useMemo(() => {
    let arr = lockers;
    if (filter !== "all") {
      arr = arr.filter((l) => getDisplayState(l, today) === filter);
    }
    if (query.trim()) {
      const q = query.trim();
      arr = arr.filter(
        (l) =>
          String(l.number).includes(q) ||
          (l.member?.name ?? "").includes(q)
      );
    }
    return arr;
  }, [lockers, filter, today, query]);

  // 박스에서 만료일(~까지)을 숨기고 '회원명 + N일후 만료'만 표시하는 조건:
  //  1) 상세 패널 열림 → 그리드가 좁아짐
  //  2) 밀집 구역(복도처럼 열이 많아 칸이 작음, layout_cols >= 10) → 글씨 잘림 방지
  const zoneDense = (currentZone?.layout_cols ?? 0) >= 10;
  const compactBox = (!!pickedLocker && isDesktop) || zoneDense;

  const dirtySettings = useMemo(() => {
    if (!currentZone) return true;
    return (
      zoneName.trim() !== currentZone.name ||
      Number(lockerCount || 0) !== currentZone.locker_count ||
      Number(startNumber || 1) !== currentZone.start_number
    );
  }, [currentZone, zoneName, lockerCount, startNumber]);

  const saveSettings = async () => {
    if (saving) return;
    setError("");
    setSavedMsg("");
    const nameTrim = zoneName.trim();
    if (!nameTrim) return setError("구역명을 입력해 주세요");
    if (nameTrim.length > ZONE_NAME_MAX)
      return setError(`구역명은 ${ZONE_NAME_MAX}자 이내로 입력해 주세요`);
    const count = Number(lockerCount || 0);
    if (!Number.isInteger(count) || count < 0)
      return setError("락커 갯수는 0 이상의 정수여야 해요");
    const start = Number(startNumber || 1);
    if (!Number.isInteger(start) || start < 1)
      return setError("시작 번호는 1 이상의 정수여야 해요");

    setSaving(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/lockers/zones/${zone}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          name: nameTrim,
          locker_count: count,
          start_number: start,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
      setSavedMsg("저장되었습니다");
      await loadZones();
      await loadLockers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  const saveLayout = async () => {
    if (savingLayout) return;
    setError("");
    setSavedMsg("");
    setSavingLayout(true);
    try {
      const token = await getIdToken();
      // 1) rows/cols 저장
      const zoneRes = await fetch(`/api/crm/lockers/zones/${zone}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          layout_rows: layoutRows,
          layout_cols: layoutCols,
        }),
      });
      const zoneData = await zoneRes.json();
      if (!zoneRes.ok) throw new Error(zoneData?.error || "그리드 저장 실패");

      // 2) 각 락커 위치 저장
      const positions = lockers.map((l) => ({
        id: l.id,
        row: layoutMap[l.id]?.row ?? null,
        col: layoutMap[l.id]?.col ?? null,
      }));
      if (positions.length > 0) {
        const layoutRes = await fetch("/api/crm/lockers/layout", {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ zone, positions }),
        });
        const layoutData = await layoutRes.json();
        if (!layoutRes.ok) throw new Error(layoutData?.error || "배치 저장 실패");
      }
      setSavedMsg("배치도가 저장되었습니다");
      setLayoutEditMode(false);
      await loadZones();
      await loadLockers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSavingLayout(false);
    }
  };

  const cancelLayoutEdit = () => {
    setLayoutEditMode(false);
    setPickedForPlace(null);
    // 원본 되돌리기
    if (currentZone) {
      setLayoutRows(currentZone.layout_rows ?? 0);
      setLayoutCols(currentZone.layout_cols ?? 0);
    }
    const map: Record<number, { row: number; col: number } | null> = {};
    for (const l of lockers) {
      map[l.id] =
        l.layout_row !== null && l.layout_col !== null
          ? { row: l.layout_row, col: l.layout_col }
          : null;
    }
    setLayoutMap(map);
  };

  const placeAt = (lockerId: number, row: number, col: number) => {
    setLayoutMap((prev) => ({
      ...prev,
      [lockerId]: { row, col },
    }));
    setPickedForPlace(null);
  };

  const removeFromLayout = (lockerId: number) => {
    setLayoutMap((prev) => ({
      ...prev,
      [lockerId]: null,
    }));
  };

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-7xl mx-auto">
      <header className="mb-5">
        <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
          락커
        </h1>
        <p className="mt-1 text-[13px] text-[#6B5D47] dark:text-zinc-400">
          회원에게 락커를 배정하고 만료를 관리해요.
        </p>
      </header>

      <div className="mb-5 flex gap-1.5 border-b border-[#E8E0D0] dark:border-zinc-800 overflow-x-auto">
        <TabBtn active={tab === "assigned"} onClick={() => setTab("assigned")}>배정 현황</TabBtn>
        <TabBtn active={tab === "unassigned"} onClick={() => setTab("unassigned")}>미배정자</TabBtn>
        <TabBtn active={tab === "returns"} onClick={() => setTab("returns")}>회수 기록</TabBtn>
        <TabBtn active={tab === "settings"} onClick={() => setTab("settings")}>락커 설정</TabBtn>
      </div>

      {tab === "assigned" && (
        <>
          <Notice>
            만료 시, 자동으로 락커가 회수되지 않아요. 락커 현황을 확인해 락커 관리를 해 주세요.
          </Notice>

          <ZoneChips
            zone={zone}
            onChange={setZone}
            zoneLabel={zoneLabel}
            zones={zones}
            showOnlyActive
            onAddRoom={() => {
              // 비어있는 첫 zone 으로 전환 + 설정 탭 이동
              const free = zones.find((z) => z.locker_count === 0);
              if (free) setZone(free.zone_number);
              setTab("settings");
            }}
          />

          <div className={pickedLocker && isDesktop ? "lg:flex lg:gap-4 lg:items-start" : ""}>
          <div className={pickedLocker && isDesktop ? "lg:flex-1 lg:min-w-0" : ""}>
          {/* 뷰 모드 토글 */}
          <div className="flex items-center gap-2 mb-3">
            <div className="inline-flex border border-[#E8E0D0] dark:border-zinc-700 rounded-lg overflow-hidden">
              {(["compact", "box", "list"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 text-[12px] font-medium
                    ${view === v
                      ? "bg-[#6B7B3A] text-white"
                      : "bg-[#FEFCF7] dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
                    }`}
                >
                  {v === "compact" ? "축소" : v === "box" ? "박스" : "리스트"}
                </button>
              ))}
            </div>
          </div>

          {/* 상태 카운트 칩 + 검색 */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {STATE_FILTERS.map((s) => (
              <button
                key={s.key}
                onClick={() => setFilter(s.key)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-semibold border transition-colors
                  ${filter === s.key
                    ? `${s.color} border-transparent`
                    : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300 hover:border-[#6B7B3A]/40"
                  }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${dotColor(s.key, filter === s.key)}`} />
                {s.label} {counts[s.key === "all" ? "all" : s.key]}
              </button>
            ))}
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="회원 이름 또는 락커 번호로 검색"
              className={`${crmInputClass} ml-auto`}
              style={{ maxWidth: 260 }}
            />
          </div>

          {/* 락커 그리드 / 리스트 */}
          {loadingLockers ? (
            <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
          ) : filtered.length === 0 ? (
            <EmptyState>
              {lockers.length === 0
                ? "락커가 없어요. 락커 설정에서 갯수를 입력해 주세요."
                : "조건에 맞는 락커가 없어요."}
            </EmptyState>
          ) : view === "list" ? (
            <div className="overflow-x-auto rounded-xl border border-[#E8E0D0] dark:border-zinc-800">
              <table className="w-full text-[13px]">
                <thead className="bg-[#FBF7EB] dark:bg-zinc-900/80 text-[#6B5D47] dark:text-zinc-400">
                  <tr>
                    <Th>번호</Th>
                    <Th>상태</Th>
                    <Th>회원</Th>
                    <Th>시작일</Th>
                    <Th>만료일</Th>
                    <Th>남은 일수</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l) => {
                    const ds = getDisplayState(l, today);
                    return (
                      <tr
                        key={l.id}
                        onClick={() => setPickedLocker(l)}
                        className="border-t border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 hover:bg-[#FBF7EB] dark:hover:bg-zinc-900/60 cursor-pointer"
                      >
                        <Td><span className="font-semibold text-[#2A251D] dark:text-zinc-100">{l.number}</span></Td>
                        <Td>
                          <span className={`px-1.5 py-0.5 rounded text-[10.5px] font-semibold ${STATE_CHIP_CLS[ds]}`}>
                            {STATE_LABEL[ds]}
                          </span>
                        </Td>
                        <Td>{l.member?.name ?? "—"}</Td>
                        <Td className="text-[#8C8270]">{l.start_date ?? "—"}</Td>
                        <Td className="text-[#8C8270]">{l.expires_at ?? "—"}</Td>
                        <Td className="text-[#6B5D47]">
                          {l.expires_at ? expireSubtitle(l.expires_at, today) : "—"}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : view === "compact" ? (
            (() => {
              const gridRows = currentZone?.layout_rows ?? 0;
              const gridCols = currentZone?.layout_cols ?? 0;
              const useLayoutGrid = gridRows > 0 && gridCols > 0;
              const layoutMap = buildLayoutMap(lockers, gridRows, gridCols);
              const filterSet = new Set(filtered.map((l) => l.id));
              const cellCls = (l: Locker) => {
                const ds = getDisplayState(l, today);
                return ds === "unassigned"
                  ? "border-yellow-300 bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:border-yellow-500/40 dark:bg-yellow-400/10 dark:text-yellow-200"
                  : ds === "active"
                  ? "border-emerald-500 bg-emerald-100 text-emerald-900 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-500"
                  : ds === "expiring"
                  ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300"
                  : ds === "expired"
                  ? "border-zinc-300 bg-zinc-300/70 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500"
                  : ds === "broken"
                  ? "border-zinc-500 bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
                  : "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
              };
              if (useLayoutGrid) {
                return (
                  <div
                    className="grid gap-1.5"
                    // 압축 뷰 셀 크기 상한 (남자탈의실 기준). 열 수 적어도 과대 확대 방지
                    style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(40px, 90px))` }}
                  >
                    {Array.from({ length: gridRows * gridCols }, (_, i) => {
                      const r = Math.floor(i / gridCols);
                      const c = i % gridCols;
                      const l = layoutMap.get(`${r}-${c}`);
                      if (!l) {
                        return (
                          <div
                            key={`${r}-${c}`}
                            className="aspect-square rounded-lg border border-dashed border-[#E8E0D0]/40 dark:border-zinc-800/40"
                          />
                        );
                      }
                      const dimmed = !filterSet.has(l.id);
                      return (
                        <button
                          key={l.id}
                          onClick={() => setPickedLocker(l)}
                          className={`aspect-square rounded-lg border font-bold flex flex-col items-center justify-center leading-none transition-colors ${cellCls(l)} ${dimmed ? "opacity-25" : ""}`}
                        >
                          <span className="text-[13.5px]">{l.number}</span>
                          {l.expires_at && (
                            <>
                              {!compactBox && (
                                <span className="mt-0.5 text-[7.5px] font-medium opacity-80">
                                  ~{expireShort(l.expires_at)}까지
                                </span>
                              )}
                              <span className="text-[7.5px] font-medium opacity-70">
                                {expireSubtitle(l.expires_at, today)}
                              </span>
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              }
              return (
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1.5">
                  {filtered.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => setPickedLocker(l)}
                      className={`aspect-square rounded-lg border font-bold flex flex-col items-center justify-center leading-none transition-colors ${cellCls(l)}`}
                    >
                      <span className="text-[13.5px]">{l.number}</span>
                      {l.expires_at && (
                        <>
                          {!compactBox && (
                            <span className="mt-0.5 text-[7.5px] font-medium opacity-80">
                              ~{expireShort(l.expires_at)}까지
                            </span>
                          )}
                          <span className="text-[7.5px] font-medium opacity-70">
                            {expireSubtitle(l.expires_at, today)}
                          </span>
                        </>
                      )}
                    </button>
                  ))}
                </div>
              );
            })()
          ) : (
            (() => {
              const gridRows = currentZone?.layout_rows ?? 0;
              const gridCols = currentZone?.layout_cols ?? 0;
              const useLayoutGrid = gridRows > 0 && gridCols > 0;
              const layoutMap = buildLayoutMap(lockers, gridRows, gridCols);
              const filterSet = new Set(filtered.map((l) => l.id));
              if (useLayoutGrid) {
                return (
                  <div
                    className="grid gap-2.5"
                    // cap max width so 컬럼 수가 적을 때(예: 6열 센터입구) 셀이 과도하게 커지지 않음.
                    // 남자탈의실(8열) 기준 셀 크기와 비슷하게 유지.
                    style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(90px, 130px))` }}
                  >
                    {Array.from({ length: gridRows * gridCols }, (_, i) => {
                      const r = Math.floor(i / gridCols);
                      const c = i % gridCols;
                      const l = layoutMap.get(`${r}-${c}`);
                      if (!l) {
                        return (
                          <div
                            key={`${r}-${c}`}
                            className="aspect-square rounded-xl border border-dashed border-[#E8E0D0]/40 dark:border-zinc-800/40"
                          />
                        );
                      }
                      const dimmed = !filterSet.has(l.id);
                      return (
                        <div
                          key={l.id}
                          className={`aspect-square min-h-[90px] flex ${dimmed ? "opacity-25" : ""}`}
                        >
                          <LockerCard locker={l} today={today} compact={compactBox} onClick={() => setPickedLocker(l)} />
                        </div>
                      );
                    })}
                  </div>
                );
              }
              return (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                  {filtered.map((l) => (
                    <div key={l.id} className="min-h-[110px] flex">
                      <LockerCard
                        locker={l}
                        today={today}
                        compact={compactBox}
                        onClick={() => setPickedLocker(l)}
                      />
                    </div>
                  ))}
                </div>
              );
            })()
          )}

          {error && (
            <div className="mt-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
          </div>
          {pickedLocker && isDesktop && (
            <div className="lg:w-[360px] lg:shrink-0 mt-4 lg:mt-0">
              <LockerActionModal
                locker={pickedLocker}
                today={today}
                onClose={() => setPickedLocker(null)}
                onDone={() => {
                  setPickedLocker(null);
                  loadLockers();
                }}
                onMove={(l) => {
                  setPickedLocker(null);
                  setMoveSource(l);
                }}
                variant="panel"
              />
            </div>
          )}
          </div>
        </>
      )}

      {tab === "unassigned" && <UnassignedTab zone={zone} zoneLabel={zoneLabel} onZoneChange={setZone} onAssigned={loadLockers} />}

      {tab === "returns" && <ReturnsTab zone={zone} zoneLabel={zoneLabel} />}

      {tab === "settings" && (
        <>
          <ZoneChips
            zone={zone}
            onChange={setZone}
            zoneLabel={zoneLabel}
            zones={zones}
            showOnlyActive
            onAddRoom={() => {
              const free = zones.find((z) => z.locker_count === 0);
              if (free) setZone(free.zone_number);
            }}
          />

          <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5 mb-3">
            <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-3">
              기본 설정
            </h2>
            {loadingZones ? (
              <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
            ) : (
              <div className="space-y-3.5">
                <Field label="구역명">
                  <div className="relative">
                    <input
                      type="text"
                      value={zoneName}
                      onChange={(e) => setZoneName(e.target.value.slice(0, ZONE_NAME_MAX))}
                      maxLength={ZONE_NAME_MAX}
                      className={`${crmInputClass} pr-12`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#A89B80] pointer-events-none">
                      {zoneName.length}/{ZONE_NAME_MAX}
                    </span>
                  </div>
                </Field>
                <Field label="락커 갯수">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={lockerCount}
                    onChange={(e) => setLockerCount(e.target.value.replace(/\D/g, ""))}
                    placeholder="락커 갯수를 입력해 주세요."
                    className={crmInputClass}
                  />
                </Field>
                <Field label="시작 번호">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={startNumber}
                    onChange={(e) => setStartNumber(e.target.value.replace(/\D/g, ""))}
                    placeholder="시작 번호를 입력해 주세요."
                    className={crmInputClass}
                  />
                </Field>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5 mb-4">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
                락커 배치도
              </h2>
              <div className="flex items-center gap-2">
                {lockers.length > 0 && !layoutEditMode && (
                  <span className="text-[11.5px] text-[#A89B80] dark:text-zinc-500">
                    총 {lockers.length}개 · 배정 {lockers.filter((l) => l.state === "assigned").length}개
                  </span>
                )}
                {lockers.length > 0 && !layoutEditMode && (
                  <button
                    type="button"
                    onClick={() => setLayoutEditMode(true)}
                    className="px-2.5 py-1 rounded-full text-[11.5px] font-medium border border-[#6B7B3A] text-[#6B7B3A] dark:text-[#A8B87A] dark:border-[#A8B87A] hover:bg-[#6B7B3A]/5"
                  >
                    배치 편집
                  </button>
                )}
                {layoutEditMode && (
                  <>
                    <button
                      type="button"
                      onClick={cancelLayoutEdit}
                      disabled={savingLayout}
                      className="px-2.5 py-1 rounded-full text-[11.5px] font-medium border border-[#E8E0D0] dark:border-zinc-700 text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5]"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={saveLayout}
                      disabled={savingLayout}
                      className="px-3 py-1 rounded-full text-[11.5px] font-semibold bg-[#6B7B3A] text-white hover:bg-[#5a6932] disabled:opacity-60"
                    >
                      {savingLayout ? "저장 중…" : "배치 저장"}
                    </button>
                  </>
                )}
              </div>
            </div>

            {loadingLockers ? (
              <div className="text-[13px] text-[#8C8270] py-6 text-center">불러오는 중…</div>
            ) : lockers.length === 0 ? (
              <EmptyState>
                아직 락커가 없어요. 위에서 락커 개수와 시작 번호를 입력하고 저장하면 배치도가 나타나요.
              </EmptyState>
            ) : layoutEditMode ? (
              <LayoutEditor
                rows={layoutRows}
                cols={layoutCols}
                onRowsChange={setLayoutRows}
                onColsChange={setLayoutCols}
                lockers={lockers}
                today={today}
                layoutMap={layoutMap}
                pickedForPlace={pickedForPlace}
                onPick={setPickedForPlace}
                onPlace={placeAt}
                onRemove={removeFromLayout}
                onBulkReplace={(nextMap) => {
                  setLayoutMap(nextMap);
                  setPickedForPlace(null);
                }}
              />
            ) : (
              <LayoutView lockers={lockers} today={today} rows={layoutRows} cols={layoutCols} />
            )}
          </section>

          {error && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
          {savedMsg && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-[#6B7B3A]/10 text-[13px] text-[#6B7B3A] dark:text-[#A8B87A]">
              {savedMsg}
            </div>
          )}

          <button
            onClick={saveSettings}
            disabled={saving || !dirtySettings}
            className={`w-full px-4 py-3 rounded-lg text-[14.5px] font-semibold transition-colors ${dirtySettings ? "bg-[#6B7B3A] text-white hover:bg-[#5a6932] disabled:opacity-60" : "bg-[#E9E2D2] text-[#B0A488] dark:bg-zinc-800 dark:text-zinc-500"}`}
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </>
      )}

      {/* 모바일: 모달. 데스크탑(배정 현황 탭)에서는 위의 우측 패널이 담당. */}
      {(!isDesktop || tab !== "assigned") && (
        <LockerActionModal
          locker={pickedLocker}
          today={today}
          onClose={() => setPickedLocker(null)}
          onDone={() => {
            setPickedLocker(null);
            loadLockers();
          }}
          onMove={(l) => {
            setPickedLocker(null);
            setMoveSource(l);
          }}
        />
      )}

      <MoveLockerModal
        source={moveSource}
        candidates={lockers.filter((l) => l.state === "unassigned" && l.id !== moveSource?.id)}
        zoneName={currentZone?.name ?? ""}
        onClose={() => setMoveSource(null)}
        onDone={() => {
          setMoveSource(null);
          loadLockers();
        }}
      />
    </div>
  );
}

/* ─── 락커 이동 모달 ────────────────────────────── */

function MoveLockerModal({
  source,
  candidates,
  zoneName,
  onClose,
  onDone,
}: {
  source: Locker | null;
  candidates: Locker[];
  zoneName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { getIdToken } = useAuth();
  const [targetId, setTargetId] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!source) {
      setTargetId("");
      setError("");
    }
  }, [source]);

  if (!source) return null;

  const submit = async () => {
    if (!targetId) return setError("이동할 락커를 선택해 주세요");
    setSubmitting(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/lockers/${source.id}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ action: "move", to_locker_id: Number(targetId) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "이동 실패");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CrmModal open={source !== null} onClose={onClose} title={`락커 ${source.number}번 이동`} size="md">
      <div className="space-y-3.5">
        <div className="px-3.5 py-2.5 rounded-lg bg-[#FBF7EB] dark:bg-zinc-900/60 border border-[#E8E0D0]/70 dark:border-zinc-800 text-[13px] text-[#3A342A] dark:text-zinc-300">
          <strong>{source.member?.name ?? "회원"}</strong>의 정보를{" "}
          <strong>{zoneName}</strong>의 다른 락커로 옮깁니다.
        </div>

        <CrmField label="이동할 락커 번호" required>
          {candidates.length === 0 ? (
            <div className="px-3 py-2.5 rounded-lg border border-dashed border-[#E8E0D0] dark:border-zinc-700 text-[12.5px] text-[#8C8270] text-center">
              현재 락커룸에 비어있는 락커가 없어요. 다른 락커룸으로의 이동은 곧 추가됩니다.
            </div>
          ) : (
            <select
              className={crmInputClass}
              value={targetId}
              onChange={(e) => setTargetId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">선택해 주세요</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.number}번 (미배정)
                </option>
              ))}
            </select>
          )}
        </CrmField>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-50 text-[13px] text-red-700">{error}</div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-lg border border-[#E8E0D0] text-[13.5px] font-semibold hover:bg-[#F5F0E5]"
          >
            취소
          </button>
          <button
            onClick={submit}
            disabled={submitting || !targetId || candidates.length === 0}
            className="flex-1 px-4 py-2.5 rounded-lg bg-[#6B7B3A] disabled:opacity-50 text-white text-[13.5px] font-semibold hover:bg-[#5a6932]"
          >
            {submitting ? "이동 중…" : "이동"}
          </button>
        </div>
      </div>
    </CrmModal>
  );
}

/* ─── 락커 카드 ────────────────────────────── */

function LockerCard({
  locker,
  today,
  onClick,
  compact,
}: {
  locker: Locker;
  today: string;
  onClick: () => void;
  compact?: boolean;
}) {
  const ds = getDisplayState(locker, today);
  const isEmpty = ds === "unassigned" || ds === "broken";

  return (
    <button
      onClick={onClick}
      className={`text-left p-3 rounded-xl border transition-colors h-full w-full flex flex-col overflow-hidden
        ${ds === "unassigned"
          ? "border-yellow-300 bg-yellow-100 dark:border-yellow-500/40 dark:bg-yellow-400/10 hover:bg-yellow-200"
          : isEmpty
          ? "border-dashed border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB]/40 dark:bg-zinc-900/40 hover:border-[#6B7B3A]/40"
          : ds === "expired"
          ? "border-zinc-300 dark:border-zinc-700 bg-zinc-300/70 dark:bg-zinc-800 hover:border-[#6B7B3A]/40"
          : "border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 hover:border-[#6B7B3A]/40"
        }`}
    >
      <div className="flex items-start justify-between">
        <span className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100">
          {locker.number}
        </span>
        {ds !== "unassigned" && (
          <span className={`px-1.5 py-0.5 rounded text-[10.5px] font-semibold ${STATE_CHIP_CLS[ds]}`}>
            {STATE_LABEL[ds]}
          </span>
        )}
      </div>

      {locker.member ? (
        <>
          <div className="mt-1 text-[13.5px] font-semibold text-[#2A251D] dark:text-zinc-100 truncate">
            {locker.member.name}
          </div>
          {locker.expires_at && (
            <div className="mt-auto truncate">
              {!compact && (
                <div className="text-[11.5px] font-medium text-[#3A342A] dark:text-zinc-300">
                  ~{expireShort(locker.expires_at)}까지
                </div>
              )}
              <div className="text-[10.5px] text-[#8C8270] dark:text-zinc-500">
                {expireSubtitle(locker.expires_at, today)}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center pb-3 text-[#A89B80] dark:text-zinc-500 text-[26px] leading-none">
          +
        </div>
      )}
    </button>
  );
}

/** "2026-09-10" → "26.09.10" (박스 표시용 짧은 만료일) */
function expireShort(ymd: string | null): string {
  if (!ymd) return "";
  const m = ymd.slice(0, 10).split("-");
  if (m.length !== 3) return "";
  return `${m[0].slice(2)}.${m[1]}.${m[2]}`;
}

function expireSubtitle(expires: string, today: string): string {
  const d = daysUntil(expires, today);
  if (d > 0) return `${d}일후 만료`;
  if (d === 0) return "오늘 만료";
  return `${-d}일째 만료`;
}

/* ─── 미배정자 탭 ────────────────────────────── */

interface UnassignedMember {
  id: number;
  name: string;
  phone: string | null;
  birth: string | null;
  gender: string | null;
  member_type: string;
  created_at: string;
  linked_firebase_uid: string | null;
  last_pass: { lesson_kind: string; issued_at: string; paid_at: string } | null;
}

const MEMBER_TYPE_KO: Record<string, string> = {
  provisional: "가회원",
  full: "정회원",
  matched: "매칭회원",
};

function UnassignedTab({ onAssigned }: { zone: number; zoneLabel: (n: number) => string; onZoneChange: (n: number) => void; onAssigned?: () => void }) {
  const { getIdToken } = useAuth();
  const [list, setList] = useState<UnassignedMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [pickedForAssign, setPickedForAssign] = useState<UnassignedMember | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const allChecked = list.length > 0 && list.every((m) => selectedIds.has(m.id));
  const toggleAll = () => {
    if (allChecked) setSelectedIds(new Set());
    else setSelectedIds(new Set(list.map((m) => m.id)));
  };
  const selectedMembers = list.filter((m) => selectedIds.has(m.id));

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const url = `/api/crm/lockers/unassigned-members${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`;
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setList(data.members ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, query]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
          미배정자 목록 ({list.length}명)
          {selectedIds.size > 0 && (
            <span className="ml-2 text-[12px] text-[#6B7B3A] font-normal">
              · {selectedIds.size}명 선택됨
            </span>
          )}
        </h2>
        {selectedIds.size > 0 && (
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 rounded-lg border border-[#E8E0D0] text-[12.5px] text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5]"
            >
              선택 해제
            </button>
            <button
              onClick={() => setBulkOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-[#6B7B3A] text-white text-[12.5px] font-semibold hover:bg-[#5a6932]"
            >
              일괄 락커 배정
            </button>
          </div>
        )}
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="이름 또는 연락처로 검색"
        className={`${crmInputClass} mb-3`}
      />

      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : list.length === 0 ? (
        <EmptyState>
          {query ? "일치하는 미배정자가 없어요." : "미배정자가 없어요."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#E8E0D0] dark:border-zinc-800">
          <table className="w-full text-[13px]">
            <thead className="bg-[#FBF7EB] dark:bg-zinc-900/80 text-[#6B5D47] dark:text-zinc-400">
              <tr>
                <Th className="w-8">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    aria-label="전체 선택"
                  />
                </Th>
                <Th>이름</Th>
                <Th>회원 유형</Th>
                <Th>연락처</Th>
                <Th>구매 상품</Th>
                <Th>결제 일시</Th>
                <Th>락커 시작일</Th>
                <Th>락커 만료일</Th>
                <Th className="text-right pr-3">관리</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id} className="border-t border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
                  <Td className="w-8">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(m.id)}
                      onChange={() => toggleSelect(m.id)}
                      aria-label={`${m.name} 선택`}
                    />
                  </Td>
                  <Td><span className="font-semibold text-[#2A251D] dark:text-zinc-100">{m.name}</span></Td>
                  <Td className="text-[#6B5D47] dark:text-zinc-400">
                    {MEMBER_TYPE_KO[m.member_type] ?? m.member_type}
                  </Td>
                  <Td className="text-[#6B5D47] dark:text-zinc-400">
                    {m.phone ? formatPhone(m.phone) : "—"}
                  </Td>
                  <Td className="text-[#6B5D47] dark:text-zinc-400">
                    {m.last_pass?.lesson_kind ?? "—"}
                  </Td>
                  <Td className="text-[#8C8270] dark:text-zinc-500">
                    {m.last_pass ? formatDateTimeKST(m.last_pass.paid_at) : "—"}
                  </Td>
                  <Td className="text-[#A89B80]">—</Td>
                  <Td className="text-[#A89B80]">—</Td>
                  <Td className="text-right pr-3">
                    <button
                      onClick={() => setPickedForAssign(m)}
                      className="px-2.5 py-1 rounded-md bg-[#6B7B3A] text-white text-[12px] font-semibold hover:bg-[#5a6932]"
                    >
                      락커 배정
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AssignLockerForMemberModal
        member={pickedForAssign}
        onClose={() => setPickedForAssign(null)}
        onDone={() => {
          setPickedForAssign(null);
          load();
          onAssigned?.();
        }}
      />

      <BulkAssignModal
        members={bulkOpen ? selectedMembers : []}
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onDone={() => {
          setBulkOpen(false);
          setSelectedIds(new Set());
          load();
          onAssigned?.();
        }}
      />
    </section>
  );
}

/* ─── 일괄 락커 배정 모달 ────────────────────────────── */

function BulkAssignModal({
  members,
  open,
  onClose,
  onDone,
}: {
  members: UnassignedMember[];
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { getIdToken } = useAuth();
  const [vacant, setVacant] = useState<
    { id: number; zone_id: number; zone_name: string; number: number }[]
  >([]);
  const [zoneFilter, setZoneFilter] = useState<number | "all">("all");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expiresAt, setExpiresAt] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setError("");
      setProgress(null);
      return;
    }
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/crm/lockers/vacant", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setVacant(data.lockers ?? []);
      }
    })();
  }, [open, getIdToken]);

  const candidates = zoneFilter === "all" ? vacant : vacant.filter((v) => v.zone_id === zoneFilter);
  const enough = candidates.length >= members.length;

  const submit = async () => {
    if (submitting) return;
    setError("");
    if (members.length === 0) return setError("선택된 회원이 없습니다");
    if (!startDate || !expiresAt) return setError("시작일과 만료일을 입력해 주세요");
    if (!enough) return setError(`빈 락커가 ${members.length - candidates.length}개 부족해요`);

    setSubmitting(true);
    setProgress({ done: 0, total: members.length });
    try {
      const token = await getIdToken();
      // 회원 i → 빈 락커 i 매핑 (vacant 순서대로)
      for (let i = 0; i < members.length; i++) {
        const m = members[i];
        const locker = candidates[i];
        const res = await fetch(`/api/crm/lockers/${locker.id}`, {
          method: "PATCH",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({
            action: "assign",
            member_id: m.id,
            start_date: startDate,
            expires_at: expiresAt,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(`${m.name}: ${data?.error || "배정 실패"}`);
        }
        setProgress({ done: i + 1, total: members.length });
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  // 락커룸 목록 만들기
  const zoneMap = new Map<number, { id: number; name: string }>();
  for (const v of vacant) {
    if (!zoneMap.has(v.zone_id)) zoneMap.set(v.zone_id, { id: v.zone_id, name: v.zone_name });
  }
  const zoneList = Array.from(zoneMap.values());

  return (
    <CrmModal open={open} onClose={onClose} title={`일괄 락커 배정 (${members.length}명)`} size="lg">
      <div className="space-y-3.5">
        <div className="px-3.5 py-2.5 rounded-lg bg-[#FBF7EB] dark:bg-zinc-900/60 border border-[#E8E0D0]/70 dark:border-zinc-800 text-[12.5px] text-[#3A342A] dark:text-zinc-300 max-h-[120px] overflow-y-auto">
          <strong>대상 회원:</strong>{" "}
          {members.map((m) => m.name).join(", ")}
        </div>

        <CrmField label="락커룸 선택">
          <select
            className={crmInputClass}
            value={zoneFilter}
            onChange={(e) => setZoneFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
          >
            <option value="all">전체 락커룸 (빈 락커 {vacant.length}개)</option>
            {zoneList.map((z) => {
              const n = vacant.filter((v) => v.zone_id === z.id).length;
              return (
                <option key={z.id} value={z.id}>
                  {z.name} (빈 락커 {n}개)
                </option>
              );
            })}
          </select>
        </CrmField>

        <div className={`px-3 py-2 rounded-lg text-[12.5px] ${enough ? "bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A]" : "bg-red-50 text-red-700"}`}>
          {enough
            ? `${members.length}명 → 빈 락커 ${members.length}개 자동 매핑`
            : `빈 락커가 ${members.length - candidates.length}개 부족해요. 다른 락커룸을 선택하거나 락커 갯수를 늘리세요.`}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <CrmField label="시작일" required>
            <input
              type="date"
              className={crmInputClass}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </CrmField>
          <CrmField label="만료일" required>
            <input
              type="date"
              className={crmInputClass}
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </CrmField>
        </div>

        {progress && (
          <div className="px-3 py-2 rounded-lg bg-[#FBF7EB] text-[12.5px] text-[#6B5D47]">
            진행 중… {progress.done}/{progress.total}
          </div>
        )}

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-50 text-[13px] text-red-700">{error}</div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-lg border border-[#E8E0D0] text-[13.5px] font-semibold hover:bg-[#F5F0E5]"
          >
            취소
          </button>
          <button
            onClick={submit}
            disabled={submitting || !enough || members.length === 0}
            className="flex-1 px-4 py-2.5 rounded-lg bg-[#6B7B3A] disabled:opacity-50 text-white text-[13.5px] font-semibold hover:bg-[#5a6932]"
          >
            {submitting ? `배정 중… (${progress?.done ?? 0}/${members.length})` : `${members.length}명 일괄 배정`}
          </button>
        </div>
      </div>
    </CrmModal>
  );
}

/* ─── 회원 → 락커 배정 모달 ────────────────────────────── */

function AssignLockerForMemberModal({
  member,
  onClose,
  onDone,
}: {
  member: UnassignedMember | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { getIdToken } = useAuth();
  const [vacant, setVacant] = useState<
    { id: number; zone_id: number; zone_name: string; number: number }[]
  >([]);
  const [lockerId, setLockerId] = useState<number | "">("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expiresAt, setExpiresAt] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [password, setPassword] = useState("");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!member) {
      setLockerId("");
      setPassword("");
      setMemo("");
      setError("");
      return;
    }
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/crm/lockers/vacant", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setVacant(data.lockers ?? []);
      }
    })();
  }, [member, getIdToken]);

  if (!member) return null;

  const submit = async () => {
    if (!lockerId) return setError("락커를 선택해 주세요");
    if (!startDate || !expiresAt) return setError("시작일과 만료일을 입력해 주세요");
    setSubmitting(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/lockers/${lockerId}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          action: "assign",
          member_id: member.id,
          start_date: startDate,
          expires_at: expiresAt,
          password: password || undefined,
          memo: memo || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "배정 실패");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CrmModal open={member !== null} onClose={onClose} title="락커 배정" size="md">
      <div className="space-y-3.5">
        <div className="px-3.5 py-2.5 rounded-lg bg-[#FBF7EB] dark:bg-zinc-900/60 border border-[#E8E0D0]/70 dark:border-zinc-800 text-[13px] text-[#3A342A] dark:text-zinc-300">
          <strong>{member.name}</strong>
          {member.phone && (
            <span className="ml-2 text-[12px] text-[#8C8270]">{formatPhone(member.phone)}</span>
          )}
        </div>

        <CrmField label="락커 선택" required>
          {vacant.length === 0 ? (
            <div className="px-3 py-2.5 rounded-lg border border-dashed border-[#E8E0D0] text-center text-[12.5px] text-[#8C8270]">
              비어있는 락커가 없어요. 락커 설정에서 갯수를 늘려주세요.
            </div>
          ) : (
            <select
              className={crmInputClass}
              value={lockerId}
              onChange={(e) => setLockerId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">선택해 주세요</option>
              {vacant.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.zone_name} · {v.number}번
                </option>
              ))}
            </select>
          )}
        </CrmField>

        <div className="grid grid-cols-2 gap-2">
          <CrmField label="시작일" required>
            <input
              type="date"
              className={crmInputClass}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </CrmField>
          <CrmField label="만료일" required>
            <input
              type="date"
              className={crmInputClass}
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </CrmField>
        </div>

        <CrmField label="비밀번호">
          <input
            type="text"
            inputMode="numeric"
            className={crmInputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="0000"
          />
        </CrmField>

        <CrmField label="메모">
          <textarea
            className={`${crmInputClass} min-h-[60px]`}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </CrmField>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-50 text-[13px] text-red-700">{error}</div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-lg border border-[#E8E0D0] text-[13.5px] font-semibold hover:bg-[#F5F0E5]"
          >
            취소
          </button>
          <button
            onClick={submit}
            disabled={submitting || !lockerId || vacant.length === 0}
            className="flex-1 px-4 py-2.5 rounded-lg bg-[#6B7B3A] disabled:opacity-50 text-white text-[13.5px] font-semibold hover:bg-[#5a6932]"
          >
            {submitting ? "배정 중…" : "배정"}
          </button>
        </div>
      </div>
    </CrmModal>
  );
}

/* ─── 회수 기록 탭 ────────────────────────────── */

interface ReturnHistory {
  id: number;
  locker_id: number | null;
  zone_id: number;
  zone_name: string;
  number: number;
  member_id: number | null;
  member_name: string | null;
  start_date: string | null;
  expires_at: string | null;
  note: string | null;
  actor_uid: string;
  actor_name: string;
  created_at: string;
}

function ReturnsTab({ zone, zoneLabel }: { zone: number; zoneLabel: (n: number) => string }) {
  const { getIdToken } = useAuth();
  const [scope, setScope] = useState<"current" | "all">("all");
  const [list, setList] = useState<ReturnHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const url = `/api/crm/lockers/history?action=return${scope === "current" ? `&zone=${zone}` : ""}`;
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setList(data.history ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, scope, zone]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
          회수 처리 ({list.length}건)
        </h2>
        <div className="flex gap-1.5">
          <button
            onClick={() => setScope("all")}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium border whitespace-nowrap
              ${scope === "all"
                ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
                : "border-[#E8E0D0] bg-[#FEFCF7] text-[#3A342A] hover:border-[#6B7B3A]/40"
              }`}
          >
            전체 락커룸
          </button>
          <button
            onClick={() => setScope("current")}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium border whitespace-nowrap
              ${scope === "current"
                ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
                : "border-[#E8E0D0] bg-[#FEFCF7] text-[#3A342A] hover:border-[#6B7B3A]/40"
              }`}
          >
            {zoneLabel(zone)}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : list.length === 0 ? (
        <EmptyState>회수 기록이 없어요.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#E8E0D0] dark:border-zinc-800">
          <table className="w-full text-[13px]">
            <thead className="bg-[#FBF7EB] dark:bg-zinc-900/80 text-[#6B5D47] dark:text-zinc-400">
              <tr>
                <Th>이름</Th>
                <Th>락커 구역</Th>
                <Th>회수 전 락커 번호</Th>
                <Th>회수일</Th>
                <Th>처리자</Th>
                <Th>비고</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((h) => (
                <tr key={h.id} className="border-t border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
                  <Td><span className="font-semibold text-[#2A251D] dark:text-zinc-100">{h.member_name || "—"}</span></Td>
                  <Td className="text-[#6B5D47] dark:text-zinc-400">{h.zone_name}</Td>
                  <Td className="font-medium">{h.number}</Td>
                  <Td className="text-[#8C8270] dark:text-zinc-500">{formatDateTimeKST(h.created_at)}</Td>
                  <Td className="text-[#6B5D47] dark:text-zinc-400">{h.actor_name}</Td>
                  <Td className="text-[#6B5D47] dark:text-zinc-400 max-w-[260px]">
                    <span className="block truncate" title={h.note || ""}>
                      {h.note || "—"}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatDateTimeKST(iso: string) {
  try {
    const d = new Date(iso);
    const k = new Date(d.getTime() + 9 * 3600 * 1000);
    const yyyy = k.getUTCFullYear();
    const mm = String(k.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(k.getUTCDate()).padStart(2, "0");
    const hh = String(k.getUTCHours()).padStart(2, "0");
    const mi = String(k.getUTCMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  } catch {
    return iso;
  }
}

/* ─── 락커 액션 모달 ────────────────────────────── */

function LockerActionModal({
  locker,
  today,
  onClose,
  onDone,
  onMove,
  variant = "modal",
}: {
  locker: Locker | null;
  today: string;
  onClose: () => void;
  onDone: () => void;
  onMove?: (locker: Locker) => void;
  variant?: "modal" | "panel";
}) {
  const { getIdToken } = useAuth();
  const open = locker !== null;
  const ds = locker ? getDisplayState(locker, today) : "unassigned";
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"view" | "assign" | "history">("view");
  const [history, setHistory] = useState<
    {
      id: number;
      action: string;
      member_name: string | null;
      created_at: string;
      note: string | null;
      changes?: Record<string, { from: unknown; to: unknown }> | null;
      start_date?: string | null;
      expires_at?: string | null;
    }[]
  >([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  // 회원 이름 클릭 시 열리는 회원 상세 미니 모달
  const [quickMemberId, setQuickMemberId] = useState<number | null>(null);

  // 배정 폼
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<{ id: number; name: string; phone: string | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const [pickedMember, setPickedMember] = useState<{ id: number; name: string; phone: string | null } | null>(null);
  const [startDate, setStartDate] = useState(today);
  const [expiresAt, setExpiresAt] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [password, setPassword] = useState("");
  const [memo, setMemo] = useState("");
  // 선택한 회원이 구매한 락커 상품 (crm_sales) — 선택 시 만료일 자동 계산
  const [lockerPurchases, setLockerPurchases] = useState<
    { product_name: string; purchased_at: string; duration_value: number | null; duration_unit: string | null; amount_won: number }[]
  >([]);
  const [pickedProductName, setPickedProductName] = useState<string>("");

  // 시작일 + 기간(duration)으로 만료일 계산
  const computeExpires = (start: string, dv: number | null, du: string | null): string => {
    if (!start || !dv || dv <= 0) return "";
    const d = new Date(`${start}T00:00:00Z`);
    if (du === "year") d.setUTCFullYear(d.getUTCFullYear() + dv);
    else if (du === "day") d.setUTCDate(d.getUTCDate() + dv);
    else d.setUTCMonth(d.getUTCMonth() + dv); // 기본 month
    return d.toISOString().slice(0, 10);
  };
  const applyProduct = (name: string, start: string) => {
    setPickedProductName(name);
    const prod = lockerPurchases.find((p) => p.product_name === name);
    if (prod) {
      const exp = computeExpires(start, prod.duration_value, prod.duration_unit);
      if (exp) setExpiresAt(exp);
    }
  };

  // 열림/락커 전환 시 모든 상태를 초기화 (다른 락커를 누르면 처음처럼)
  useEffect(() => {
    setError("");
    setMemberQuery("");
    setMemberResults([]);
    setPickedMember(null);
    setLockerPurchases([]);
    setPickedProductName("");
    setHistory([]);
    if (!open || !locker) {
      setMode("view");
      setPassword("");
      setMemo("");
      return;
    }
    setPassword(locker.password ?? "");
    setMemo(locker.memo ?? "");
    setStartDate(locker.start_date ?? today);
    setExpiresAt(
      locker.expires_at ??
        (() => {
          const d = new Date();
          d.setMonth(d.getMonth() + 1);
          return d.toISOString().slice(0, 10);
        })()
    );
    // 빈 락커면 버튼 없이 바로 회원 검색(배정) 화면, 배정된 락커면 상세(view)
    setMode(locker.assigned_member_id ? "view" : "assign");
  }, [open, locker, today]);

  // 회원 선택 시 그 회원이 구매한 락커 상품 조회
  useEffect(() => {
    setPickedProductName("");
    if (!pickedMember) {
      setLockerPurchases([]);
      return;
    }
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch(`/api/crm/lockers/member-products?member_id=${pickedMember.id}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) setLockerPurchases((await res.json()).items ?? []);
      else setLockerPurchases([]);
    })();
  }, [pickedMember, getIdToken]);

  // 기록 모드 진입 시 history 로드
  useEffect(() => {
    if (mode !== "history" || !locker) return;
    (async () => {
      setLoadingHistory(true);
      try {
        const token = await getIdToken();
        if (!token) return;
        const res = await fetch(
          `/api/crm/lockers/history?action=all&locker_id=${locker.id}`,
          { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }
        );
        if (res.ok) {
          const data = await res.json();
          setHistory(data.history ?? []);
        }
      } finally {
        setLoadingHistory(false);
      }
    })();
  }, [mode, locker, getIdToken]);

  const searchMember = async () => {
    const q = memberQuery.trim();
    if (!q) return;
    setSearching(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/members?q=${encodeURIComponent(q)}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setMemberResults(data.members ?? []);
    } finally {
      setSearching(false);
    }
  };

  const callAction = async (
    action: "assign" | "return" | "update" | "broken" | "repaired",
    payload: Record<string, unknown> = {}
  ) => {
    if (!locker) return;
    setSubmitting(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/lockers/${locker.id}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "실패");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssign = async () => {
    if (!pickedMember) return setError("회원을 선택해 주세요");
    if (!startDate || !expiresAt) return setError("시작일과 만료일을 입력해 주세요");
    await callAction("assign", {
      member_id: pickedMember.id,
      start_date: startDate,
      expires_at: expiresAt,
      password: password || undefined,
      memo: memo || undefined,
    });
  };

  if (!locker) return null;

  const body = (
      <div className="space-y-3.5">
        <div className="flex items-center gap-2">
          {locker.member && (
            <button
              type="button"
              onClick={() => setQuickMemberId(locker.member!.id)}
              className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-[#6B7B3A] dark:text-[#A8B87A] hover:underline"
            >
              {locker.member.face_image_thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={locker.member.face_image_thumb}
                  alt=""
                  className="w-11 h-11 rounded-full object-cover border border-[#E8E0D0] dark:border-zinc-700 shrink-0"
                />
              ) : (
                <span className="w-11 h-11 rounded-full flex items-center justify-center bg-[#F5F0E5] dark:bg-zinc-800 text-[#A89B80] text-[16px] font-semibold shrink-0">
                  {locker.member.name?.slice(0, 1) ?? "—"}
                </span>
              )}
              <span>
                {locker.member.name}
                {locker.member.phone && (
                  <span className="ml-1 text-[12px] text-[#8C8270] font-normal">
                    · {formatPhone(locker.member.phone)}
                  </span>
                )}
              </span>
            </button>
          )}
          <span className={`ml-auto shrink-0 px-2 py-0.5 rounded text-[11.5px] font-semibold ${STATE_CHIP_CLS[ds]}`}>
            {STATE_LABEL[ds]}
          </span>
        </div>

        {/* 상세 / 기록 탭 */}
        {mode !== "assign" && (
          <div className="flex gap-1.5 border-b border-[#E8E0D0] dark:border-zinc-800 -mt-1">
            <button
              onClick={() => setMode("view")}
              className={`px-3 py-1.5 -mb-px text-[12.5px] font-medium border-b-2 transition-colors
                ${mode === "view"
                  ? "border-[#6B7B3A] text-[#6B7B3A] dark:text-[#A8B87A]"
                  : "border-transparent text-[#8C8270] hover:text-[#3A342A]"
                }`}
            >
              상세
            </button>
            <button
              onClick={() => setMode("history")}
              className={`px-3 py-1.5 -mb-px text-[12.5px] font-medium border-b-2 transition-colors
                ${mode === "history"
                  ? "border-[#6B7B3A] text-[#6B7B3A] dark:text-[#A8B87A]"
                  : "border-transparent text-[#8C8270] hover:text-[#3A342A]"
                }`}
            >
              기록
            </button>
          </div>
        )}

        {mode === "history" ? (
          <div>
            {loadingHistory ? (
              <div className="text-[13px] text-[#8C8270] py-3 text-center">불러오는 중…</div>
            ) : history.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12.5px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-lg">
                이 락커의 기록이 없어요.
              </div>
            ) : (
              <ul className="space-y-1.5 max-h-[360px] overflow-y-auto">
                {history.map((h) => (
                  <li
                    key={h.id}
                    className="px-3 py-2 rounded-lg border border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FBF7EB]/40 dark:bg-zinc-900/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12.5px] font-semibold text-[#3A342A] dark:text-zinc-200">
                        {ACTION_KO[h.action] ?? h.action}
                        {h.member_name && (
                          <span className="ml-2 text-[12px] text-[#6B5D47] dark:text-zinc-400 font-normal">
                            {h.member_name}
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] text-[#A89B80] shrink-0">
                        {formatDateTimeKST(h.created_at)}
                      </span>
                    </div>
                    {h.action === "assign" && (h.start_date || h.expires_at) && (
                      <div className="mt-1 text-[11.5px] text-[#6B5D47] dark:text-zinc-400">
                        {h.start_date ?? "—"} ~ {h.expires_at ?? "—"}
                      </div>
                    )}
                    {h.changes && Object.keys(h.changes).length > 0 && (
                      <HistoryChanges changes={h.changes} />
                    )}
                    {h.note && (
                      <div className="mt-1 text-[11.5px] text-[#8C8270] dark:text-zinc-500">
                        {h.note}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {/* 배정 모드 */}
        {mode === "assign" ? (
          <>
            <CrmField label="회원 검색" required>
              {pickedMember ? (
                <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-[#6B7B3A]/40 bg-[#6B7B3A]/5">
                  <span className="text-[13.5px] text-[#3A342A] dark:text-zinc-200">
                    <strong>{pickedMember.name}</strong>
                    {pickedMember.phone && (
                      <span className="ml-2 text-[12px] text-[#8C8270]">
                        {formatPhone(pickedMember.phone)}
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => setPickedMember(null)}
                    className="text-[12px] text-[#6B7B3A] hover:underline"
                  >
                    다시 선택
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <input
                      className={`${crmInputClass} flex-1`}
                      value={memberQuery}
                      onChange={(e) => setMemberQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && searchMember()}
                      placeholder="회원 이름 또는 연락처"
                    />
                    <button
                      onClick={searchMember}
                      disabled={searching}
                      className="px-4 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold disabled:opacity-60"
                    >
                      {searching ? "검색 중…" : "검색"}
                    </button>
                  </div>
                  {memberResults.length > 0 && (
                    <ul className="mt-2 space-y-1.5 max-h-[160px] overflow-y-auto">
                      {memberResults.map((m) => (
                        <li key={m.id}>
                          <button
                            onClick={() => setPickedMember(m)}
                            className="w-full text-left px-3 py-2 rounded-lg border border-[#E8E0D0] hover:border-[#6B7B3A]/40"
                          >
                            <div className="text-[13px] font-medium">{m.name}</div>
                            {m.phone && (
                              <div className="text-[11.5px] text-[#A89B80]">{formatPhone(m.phone)}</div>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </CrmField>

            {/* 회원이 구매한 락커 상품 — 있을 때만 표시. 선택 시 만료일 자동 계산 */}
            {pickedMember && lockerPurchases.length > 0 && (
              <CrmField label="구매한 락커 상품">
                <select
                  className={crmInputClass}
                  value={pickedProductName}
                  onChange={(e) => applyProduct(e.target.value, startDate)}
                >
                  <option value="">선택 안 함 (직접 입력)</option>
                  {lockerPurchases.map((p) => (
                    <option key={p.product_name} value={p.product_name}>
                      {p.product_name}
                      {p.duration_value
                        ? ` · ${p.duration_value}${p.duration_unit === "year" ? "년" : p.duration_unit === "day" ? "일" : "개월"}`
                        : ""}
                      {` · 구매 ${p.purchased_at}`}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11.5px] text-[#A89B80]">
                  구매한 상품을 선택하면 만료일이 자동 계산돼요.
                </p>
              </CrmField>
            )}

            <div className="grid grid-cols-2 gap-2">
              <CrmField label="시작일" required>
                <input
                  type="date"
                  className={crmInputClass}
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    // 상품 선택 상태면 시작일 변경 시 만료일 재계산
                    if (pickedProductName) applyProduct(pickedProductName, e.target.value);
                  }}
                />
              </CrmField>
              <CrmField label="만료일" required>
                <input
                  type="date"
                  className={crmInputClass}
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </CrmField>
            </div>

            <CrmField label="비밀번호">
              <input
                type="text"
                inputMode="numeric"
                className={crmInputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="0000"
              />
            </CrmField>

            <CrmField label="메모">
              <textarea
                className={`${crmInputClass} min-h-[60px]`}
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </CrmField>

            {error && (
              <div className="px-3 py-2 rounded-lg bg-red-50 text-[13px] text-red-700">{error}</div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setMode("view")}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 rounded-lg border border-[#E8E0D0] text-[13.5px] font-semibold hover:bg-[#F5F0E5]"
              >
                취소
              </button>
              <button
                onClick={handleAssign}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 rounded-lg bg-[#6B7B3A] text-white text-[13.5px] font-semibold disabled:opacity-60"
              >
                {submitting ? "배정 중…" : "배정하기"}
              </button>
            </div>
          </>
        ) : mode === "view" ? (
          <>
            {/* 기간 수정 (배정된 경우) */}
            {locker.state === "assigned" && (
              <div className="grid grid-cols-2 gap-2">
                <CrmField label="시작일">
                  <input
                    type="date"
                    className={crmInputClass}
                    value={startDate}
                    max={expiresAt || undefined}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </CrmField>
                <CrmField label="만료일">
                  <input
                    type="date"
                    className={crmInputClass}
                    value={expiresAt}
                    min={startDate || undefined}
                    onChange={(e) => setExpiresAt(e.target.value)}
                  />
                </CrmField>
                {locker.expires_at && (
                  <div className="col-span-2 -mt-2 text-[11.5px] text-[#8C8270]">
                    현재 만료 상태: {expireSubtitle(locker.expires_at, today)}
                  </div>
                )}
              </div>
            )}

            {/* 비밀번호·메모 */}
            <CrmField label="비밀번호">
              <input
                type="text"
                inputMode="numeric"
                className={crmInputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="0000"
              />
            </CrmField>
            <CrmField label="메모">
              <textarea
                className={`${crmInputClass} min-h-[60px]`}
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </CrmField>

            {error && (
              <div className="px-3 py-2 rounded-lg bg-red-50 text-[13px] text-red-700">{error}</div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              {locker.state === "unassigned" && (
                <button
                  onClick={() => setMode("assign")}
                  disabled={submitting}
                  className="flex-1 min-w-[120px] px-4 py-2.5 rounded-lg bg-[#6B7B3A] text-white text-[13.5px] font-semibold hover:bg-[#5a6932]"
                >
                  회원 지정하기
                </button>
              )}

              {(locker.state === "assigned" || locker.state === "unassigned") && (
                <button
                  onClick={() => {
                    const payload: Record<string, unknown> = {
                      password: password || null,
                      memo: memo || null,
                    };
                    if (locker.state === "assigned") {
                      payload.start_date = startDate || null;
                      payload.expires_at = expiresAt || null;
                    }
                    callAction("update", payload);
                  }}
                  disabled={submitting}
                  className="flex-1 min-w-[100px] px-4 py-2.5 rounded-lg border border-[#6B7B3A] text-[#6B7B3A] dark:text-[#A8B87A] text-[13.5px] font-semibold hover:bg-[#6B7B3A]/5"
                >
                  {locker.state === "assigned" ? "정보 저장" : "비밀번호·메모 저장"}
                </button>
              )}

              {locker.state === "assigned" && (
                <>
                  <button
                    onClick={() => {
                      if (window.confirm("락커를 회수할까요? 회원 정보가 비워집니다.")) {
                        callAction("return");
                      }
                    }}
                    disabled={submitting}
                    className="flex-1 min-w-[100px] px-4 py-2.5 rounded-lg border border-red-200 text-red-700 text-[13.5px] font-semibold hover:bg-red-50"
                  >
                    회수
                  </button>
                  {onMove && (
                    <button
                      onClick={() => onMove(locker)}
                      disabled={submitting}
                      className="flex-1 min-w-[100px] px-4 py-2.5 rounded-lg border border-[#B47B2A] text-[#B47B2A] dark:text-amber-300 dark:border-amber-300 text-[13.5px] font-semibold hover:bg-amber-50"
                    >
                      이동
                    </button>
                  )}
                </>
              )}

              {locker.state !== "broken" ? (
                <button
                  onClick={() => {
                    if (window.confirm("고장 처리할까요?")) callAction("broken");
                  }}
                  disabled={submitting}
                  className="flex-1 min-w-[100px] px-4 py-2.5 rounded-lg border border-[#E8E0D0] text-[13.5px] text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5]"
                >
                  고장 처리
                </button>
              ) : (
                <button
                  onClick={() => callAction("repaired")}
                  disabled={submitting}
                  className="flex-1 min-w-[100px] px-4 py-2.5 rounded-lg border border-[#6B7B3A] text-[#6B7B3A] text-[13.5px] font-semibold"
                >
                  수리 완료
                </button>
              )}
            </div>
          </>
        ) : null}
      </div>
  );

  if (variant === "panel") {
    return (
      <>
        <aside className="flex flex-col rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-950 shadow-sm overflow-hidden max-h-[calc(100vh-140px)] lg:sticky lg:top-3">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8E0D0]/70 dark:border-zinc-800">
            <div className="flex items-baseline gap-2 min-w-0">
              <h2 className="text-[15px] font-semibold text-[#2A251D] dark:text-zinc-100 truncate">
                락커 {locker.number}번
              </h2>
              {locker.member && (
                <button
                  type="button"
                  onClick={() => setQuickMemberId(locker.member!.id)}
                  className="text-[12px] text-[#6B7B3A] dark:text-[#A8B87A] hover:underline truncate"
                >
                  {locker.member.name}
                </button>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="닫기"
              className="p-1 -m-1 text-[#A89B80] hover:text-[#3A342A] dark:hover:text-zinc-200 shrink-0"
            >
              <svg className="w-4.5 h-4.5" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">{body}</div>
        </aside>
        <MemberQuickModal memberId={quickMemberId} onClose={() => setQuickMemberId(null)} />
      </>
    );
  }

  return (
    <>
      <CrmModal
        open={open}
        onClose={onClose}
        title={`락커 ${locker.number}번`}
        size="md"
      >
        {body}
      </CrmModal>
      <MemberQuickModal memberId={quickMemberId} onClose={() => setQuickMemberId(null)} />
    </>
  );
}

const ACTION_KO: Record<string, string> = {
  assign: "배정",
  return: "회수",
  update: "정보 수정",
  move: "이동",
  broken: "고장 처리",
  repaired: "수리 완료",
};

const CHANGE_FIELD_KO: Record<string, string> = {
  password: "비밀번호",
  memo: "메모",
  expires_at: "만료일",
  start_date: "시작일",
};

function formatChangeValue(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "없음";
  if (key === "memo" && typeof v === "string" && v.length > 20) {
    return `"${v.slice(0, 20)}…"`;
  }
  if (typeof v === "string") return key === "memo" ? `"${v}"` : v;
  return String(v);
}

function HistoryChanges({
  changes,
}: {
  changes: Record<string, { from: unknown; to: unknown }>;
}) {
  const entries = Object.entries(changes);
  if (entries.length === 0) return null;
  return (
    <ul className="mt-1.5 space-y-0.5 text-[11.5px]">
      {entries.map(([key, val]) => (
        <li key={key} className="flex items-baseline gap-1.5 text-[#3A342A] dark:text-zinc-300">
          <span className="shrink-0 px-1.5 py-0.5 rounded bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A] font-medium">
            {CHANGE_FIELD_KO[key] ?? key}
          </span>
          <span className="text-[#8C8270]">{formatChangeValue(key, val.from)}</span>
          <span className="text-[#B47B2A] dark:text-amber-300">→</span>
          <span className="text-[#2A251D] dark:text-zinc-100 font-medium">
            {formatChangeValue(key, val.to)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ─── 공통 ────────────────────────────── */

function ZoneChips({
  zone,
  onChange,
  zoneLabel,
  zones,
  showOnlyActive,
  onAddRoom,
  onRename,
}: {
  zone: number;
  onChange: (n: number) => void;
  zoneLabel: (n: number) => string;
  zones?: Zone[];
  showOnlyActive?: boolean;
  onAddRoom?: () => void;
  onRename?: (zoneNumber: number, next: string) => Promise<void> | void;
}) {
  const [editingZone, setEditingZone] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  // showOnlyActive=true → locker_count>0 인 락커룸만 표시. 없으면 칩 없이 + 새 락커룸 버튼만.
  let numbers = Array.from({ length: ZONE_COUNT }, (_, i) => i + 1);
  if (showOnlyActive && zones) {
    numbers = zones.filter((z) => z.locker_count > 0).map((z) => z.zone_number);
  }

  return (
    <div className="mt-5 mb-4 overflow-x-auto">
      <div className="inline-flex min-w-full items-center gap-1.5 rounded-xl border border-[#E4D9C6] bg-[#F7F2E8]/80 p-1.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
      {showOnlyActive && numbers.length === 0 && (
        <span className="px-2 text-[12px] text-[#8C8270] dark:text-zinc-500">
          설정된 락커룸이 없어요.
        </span>
      )}
      {numbers.map((n) => {
        const active = zone === n;
        if (editingZone === n && onRename) {
          return (
            <div
              key={n}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#6B7B3A]/35 bg-white px-2 shadow-sm dark:border-[#A8B87A]/30 dark:bg-zinc-900"
            >
              <input
                autoFocus
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, ZONE_NAME_MAX))}
                maxLength={ZONE_NAME_MAX}
                onKeyDown={async (e) => {
                  if (e.key === "Enter" && draft.trim()) {
                    e.preventDefault();
                    setSaving(true);
                    await onRename(n, draft.trim());
                    setSaving(false);
                    setEditingZone(null);
                  }
                  if (e.key === "Escape") setEditingZone(null);
                }}
                className="h-7 w-24 rounded-md border border-[#D9CDB8] bg-[#FEFCF7] px-2 text-[12.5px] text-[#2A251D] focus:border-[#6B7B3A] focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!draft.trim()) return;
                  setSaving(true);
                  await onRename(n, draft.trim());
                  setSaving(false);
                  setEditingZone(null);
                }}
                disabled={saving}
                className="h-7 rounded-md bg-[#2F3A2B] px-2 text-[11.5px] font-bold text-white disabled:opacity-50 dark:bg-[#A8B87A] dark:text-zinc-950"
              >
                저장
              </button>
              <button
                type="button"
                onClick={() => setEditingZone(null)}
                className="h-7 rounded-md px-1.5 text-[11.5px] font-semibold text-[#8C8270] hover:bg-[#F5F0E5] dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                취소
              </button>
            </div>
          );
        }
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            onDoubleClick={() => {
              if (!onRename) return;
              setDraft(zoneLabel(n));
              setEditingZone(n);
            }}
            title={onRename ? "더블 클릭하면 구역명을 수정할 수 있어요" : undefined}
            className={`group inline-flex h-10 items-center gap-2 rounded-lg border px-3.5 text-[13px] font-semibold whitespace-nowrap transition-all
              ${active
                ? "border-[#2F3A2B] bg-[#2F3A2B] text-white shadow-sm dark:border-[#A8B87A] dark:bg-[#A8B87A] dark:text-zinc-950"
                : "border-transparent bg-transparent text-[#6B5D47] hover:border-[#D9CDB8] hover:bg-white/80 hover:text-[#2A251D] dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                active
                  ? "bg-[#D6C38D] dark:bg-zinc-950/70"
                  : "bg-[#C7B99F] opacity-60 group-hover:opacity-100 dark:bg-zinc-600"
              }`}
            />
            <span>{zoneLabel(n)}</span>
          </button>
        );
      })}
      {onAddRoom && (
        <button
          type="button"
          onClick={onAddRoom}
          className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg border border-dashed border-[#A8B87A] bg-white/55 px-3.5 text-[13px] font-bold text-[#4D622C] transition-colors hover:border-[#6B7B3A] hover:bg-[#F3F7EA] dark:border-[#A8B87A]/50 dark:bg-zinc-900/60 dark:text-[#A8B87A] dark:hover:bg-zinc-800"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#6B7B3A] text-[15px] leading-none text-white dark:bg-[#A8B87A] dark:text-zinc-950">
            +
          </span>
          <span className="whitespace-nowrap">새 락커룸</span>
        </button>
      )}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 -mb-px text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap
        ${active
          ? "border-[#6B7B3A] text-[#6B7B3A] dark:text-[#A8B87A]"
          : "border-transparent text-[#8C8270] dark:text-zinc-500 hover:text-[#3A342A] dark:hover:text-zinc-300"
        }`}
    >
      {children}
    </button>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3.5 py-2.5 rounded-lg bg-[#FBF7EB] dark:bg-zinc-900/60 border border-[#E8E0D0]/70 dark:border-zinc-800 text-[12.5px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed flex items-start gap-2">
      <svg className="w-4 h-4 mt-0.5 shrink-0 text-[#B47B2A]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{children}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12.5px] font-medium text-[#3A342A] dark:text-zinc-300 mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`text-left font-medium px-3 py-2.5 whitespace-nowrap ${className || ""}`}>{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 whitespace-nowrap ${className || ""}`}>{children}</td>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-10 text-center text-[13px] text-[#8C8270] dark:text-zinc-500 border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-xl">
      {children}
    </div>
  );
}

/* ─── 배치도 뷰 (읽기 전용) ─── */
function LayoutView({
  lockers,
  today,
  rows,
  cols,
}: {
  lockers: Locker[];
  today: string;
  rows: number;
  cols: number;
}) {
  const hasGrid = rows > 0 && cols > 0;
  const placed = lockers.filter((l) => l.layout_row !== null && l.layout_col !== null);

  // 그리드 크기만 지정되고 개별 위치가 없는 경우 → 번호순으로 자동 채워서 보여줌
  if (!hasGrid) {
    return (
      <>
        <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-1">
          {[...lockers]
            .sort((a, b) => a.number - b.number)
            .map((l) => (
              <LockerTile key={l.id} locker={l} today={today} />
            ))}
        </div>
        <LayoutLegend />
      </>
    );
  }

  const lockerAt = new Map<string, Locker>();
  for (const l of placed) {
    lockerAt.set(`${l.layout_row}-${l.layout_col}`, l);
  }
  // 배치 안 된 락커도 남은 셀에 번호순으로 자동 배치해 보여줌
  const usedCells = new Set(lockerAt.keys());
  const remaining = [...lockers]
    .filter((l) => l.layout_row === null || l.layout_col === null)
    .sort((a, b) => a.number - b.number);
  let ri = 0;
  for (let r = 0; r < rows && ri < remaining.length; r += 1) {
    for (let c = 0; c < cols && ri < remaining.length; c += 1) {
      if (usedCells.has(`${r}-${c}`)) continue;
      lockerAt.set(`${r}-${c}`, remaining[ri]);
      usedCells.add(`${r}-${c}`);
      ri += 1;
    }
  }

  return (
    <>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: rows * cols }, (_, i) => {
          const r = Math.floor(i / cols);
          const c = i % cols;
          const l = lockerAt.get(`${r}-${c}`);
          if (l) return <LockerTile key={l.id} locker={l} today={today} />;
          return (
            <div
              key={`${r}-${c}`}
              className="aspect-square rounded-md border border-dashed border-[#E8E0D0]/60 dark:border-zinc-800 bg-transparent"
            />
          );
        })}
      </div>
      <LayoutLegend />
      {remaining.length > 0 && (
        <div className="mt-3 text-[11.5px] text-[#8C8270] dark:text-zinc-500">
          위치를 지정하지 않은 락커 {remaining.length}개를 번호순으로 자동 배치했어요. 원하면 배치 편집으로 위치를 조정할 수 있어요.
        </div>
      )}
    </>
  );
}

/** rows×cols 그리드에서 (row,col) → locker 매핑. layout_row/col 이 없는 락커는
 *  남은 셀에 번호순으로 자동 배치. */
function buildLayoutMap(
  lockers: Locker[],
  rows: number,
  cols: number
): Map<string, Locker> {
  const map = new Map<string, Locker>();
  if (rows <= 0 || cols <= 0) return map;
  for (const l of lockers) {
    if (l.layout_row !== null && l.layout_col !== null) {
      map.set(`${l.layout_row}-${l.layout_col}`, l);
    }
  }
  const remaining = [...lockers]
    .filter((l) => l.layout_row === null || l.layout_col === null)
    .sort((a, b) => a.number - b.number);
  let ri = 0;
  for (let r = 0; r < rows && ri < remaining.length; r += 1) {
    for (let c = 0; c < cols && ri < remaining.length; c += 1) {
      if (map.has(`${r}-${c}`)) continue;
      map.set(`${r}-${c}`, remaining[ri]);
      ri += 1;
    }
  }
  return map;
}

function LayoutLegend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11.5px] text-[#6B5D47] dark:text-zinc-400">
      <LegendChip className="border-yellow-300 bg-yellow-100 text-yellow-700" label="미배정" />
      <LegendChip className="border-[#6B7B3A]/40 bg-[#6B7B3A]/10 text-[#3A342A] dark:text-zinc-100" label="활성" />
      <LegendChip className="border-red-300 bg-red-50 text-red-700" label="임박" />
      <LegendChip className="border-zinc-300 bg-zinc-300/70 text-zinc-500" label="만료" />
      <LegendChip className="border-zinc-500 bg-zinc-200 text-zinc-700" label="고장" />
    </div>
  );
}

function LockerTile({ locker, today }: { locker: Locker; today: string }) {
  const ds = getDisplayState(locker, today);
  const cls =
    ds === "unassigned"
      ? "border-yellow-300 bg-yellow-100 text-yellow-700 dark:border-yellow-500/40 dark:bg-yellow-400/10 dark:text-yellow-200"
      : ds === "active"
      ? "border-emerald-500 bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-500"
      : ds === "expiring"
      ? "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
      : ds === "expired"
      ? "border-zinc-300 bg-zinc-300/70 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500"
      : ds === "broken"
      ? "border-zinc-500 bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
      : "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
  return (
    <div
      className={`aspect-square rounded-md border text-[11.5px] font-semibold flex items-center justify-center ${cls}`}
      title={locker.member ? `${locker.number}번 · ${locker.member.name}` : `${locker.number}번 · 미배정`}
    >
      {locker.number}
    </div>
  );
}

/* ─── 배치도 편집기 ─── */
function LayoutEditor({
  rows,
  cols,
  onRowsChange,
  onColsChange,
  lockers,
  today,
  layoutMap,
  pickedForPlace,
  onPick,
  onPlace,
  onRemove,
  onBulkReplace,
}: {
  rows: number;
  cols: number;
  onRowsChange: (n: number) => void;
  onColsChange: (n: number) => void;
  lockers: Locker[];
  today: string;
  layoutMap: Record<number, { row: number; col: number } | null>;
  pickedForPlace: number | null;
  onPick: (id: number | null) => void;
  onPlace: (id: number, row: number, col: number) => void;
  onRemove: (id: number) => void;
  onBulkReplace: (nextMap: Record<number, { row: number; col: number } | null>) => void;
}) {
  const hasGrid = rows > 0 && cols > 0;
  const placedIds = new Set<number>();
  const lockerAt = new Map<string, Locker>();
  for (const l of lockers) {
    const pos = layoutMap[l.id];
    if (pos) {
      placedIds.add(l.id);
      lockerAt.set(`${pos.row}-${pos.col}`, l);
    }
  }
  const pool = lockers
    .filter((l) => !placedIds.has(l.id))
    .sort((a, b) => a.number - b.number);

  const cellClick = (r: number, c: number) => {
    const existing = lockerAt.get(`${r}-${c}`);
    if (existing) {
      // 이미 있는 락커 클릭 → 미배치로 이동
      onRemove(existing.id);
      return;
    }
    if (pickedForPlace !== null) {
      onPlace(pickedForPlace, r, c);
    }
  };

  // 남은 락커 자동 채우기.
  //   • 배치된 락커 6개 이상 → 이웃 번호쌍의 (dr,dc) 델타 중 최빈값으로 방향 학습 후 동일 규칙 적용
  //   • 그 미만 → 왼쪽 위 → 오른쪽 아래 row-major 폴백
  const autoFillRemaining = () => {
    if (!hasGrid || pool.length === 0) return;

    const placed = lockers
      .map((l) => {
        const pos = layoutMap[l.id];
        return pos ? { id: l.id, number: l.number, row: pos.row, col: pos.col } : null;
      })
      .filter((x): x is { id: number; number: number; row: number; col: number } => x !== null)
      .sort((a, b) => a.number - b.number);

    const used = new Set<string>();
    for (const p of placed) used.add(`${p.row}-${p.col}`);

    // 학습 방향: n → n+1 연속번호쌍만 (거리 1 인 셀만) 델타 집계
    //   • 사용자가 최근 배치한 소수의 규칙성 있는 쌍이 초기 자동배치 패턴에 묻히지 않도록
    //   • 최소 5개 이상의 연속번호쌍이 학습되어야 방향으로 채택
    let linearize: ((r: number, c: number) => number) | null = null;
    if (placed.length >= 6) {
      const numberToPos = new Map(placed.map((p) => [p.number, p]));
      const counts = new Map<string, number>();
      for (const p of placed) {
        const next = numberToPos.get(p.number + 1);
        if (!next) continue;
        const dr = next.row - p.row;
        const dc = next.col - p.col;
        if (Math.abs(dr) + Math.abs(dc) === 1) {
          const k = `${dr},${dc}`;
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
      }
      let bestKey = "";
      let bestCount = 0;
      counts.forEach((v, k) => {
        if (v > bestCount) {
          bestCount = v;
          bestKey = k;
        }
      });
      // 5쌍 이상 일치할 때만 채택. 그 이하면 폴백(row-major LR)
      if (bestCount >= 5) {
        const [drStr, dcStr] = bestKey.split(",");
        const dr = Number(drStr);
        const dc = Number(dcStr);
        if (dc === 1) linearize = (r, c) => r * cols + c;
        else if (dc === -1) linearize = (r, c) => r * cols + (cols - 1 - c);
        else if (dr === 1) linearize = (r, c) => c * rows + r;
        else if (dr === -1) linearize = (r, c) => c * rows + (rows - 1 - r);
      }
    }

    // 빈 셀 목록 (학습 순서로 정렬)
    const emptyCells: { row: number; col: number; score: number }[] = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (used.has(`${r}-${c}`)) continue;
        const score = linearize ? linearize(r, c) : r * cols + c;
        emptyCells.push({ row: r, col: c, score });
      }
    }
    emptyCells.sort((a, b) => a.score - b.score);

    // 빈 셀을 학습된 순서(score ASC)로 정렬. 이미 배치된 락커 중 규칙에서 벗어난 셀은
    // 그대로 두고, unplaced 를 남은 빈 셀에 번호 ASC 순으로 배치.
    const sortedPool = [...pool].sort((a, b) => a.number - b.number);
    const nextMap = { ...layoutMap };
    for (let i = 0; i < sortedPool.length && i < emptyCells.length; i += 1) {
      nextMap[sortedPool[i].id] = { row: emptyCells[i].row, col: emptyCells[i].col };
    }
    onBulkReplace(nextMap);
  };

  // 전체 재정렬: 기존 배치 무시하고 번호순으로 왼쪽 위 → 오른쪽 아래
  const autoArrangeAll = () => {
    if (!hasGrid) return;
    if (!window.confirm("현재 배치를 초기화하고 번호순으로 다시 정렬할까요?")) return;
    const sorted = [...lockers].sort((a, b) => a.number - b.number);
    const nextMap: Record<number, { row: number; col: number } | null> = {};
    for (const l of lockers) nextMap[l.id] = null;
    for (let i = 0; i < sorted.length && i < rows * cols; i += 1) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      nextMap[sorted[i].id] = { row: r, col: c };
    }
    onBulkReplace(nextMap);
  };

  const clearAll = () => {
    if (Object.values(layoutMap).every((v) => v === null)) return;
    if (!window.confirm("배치를 모두 비울까요?")) return;
    const nextMap: Record<number, { row: number; col: number } | null> = {};
    for (const l of lockers) nextMap[l.id] = null;
    onBulkReplace(nextMap);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
          <span className="block mb-1">행 (세로)</span>
          <input
            type="number"
            min={0}
            max={40}
            value={rows}
            onChange={(e) =>
              onRowsChange(Math.max(0, Math.min(40, Number(e.target.value) || 0)))
            }
            className="w-20 px-2 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[13px]"
          />
        </label>
        <label className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
          <span className="block mb-1">열 (가로)</span>
          <input
            type="number"
            min={0}
            max={40}
            value={cols}
            onChange={(e) =>
              onColsChange(Math.max(0, Math.min(40, Number(e.target.value) || 0)))
            }
            className="w-20 px-2 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[13px]"
          />
        </label>
        <div className="ml-auto text-[11.5px] text-[#6B5D47] dark:text-zinc-400">
          <span className="text-[#B47B2A] dark:text-amber-300">
            배치 안 된 락커 {pool.length}개
          </span>{" "}
          / 그리드 {rows}×{cols}
        </div>
      </div>

      {/* 자동 배치 버튼 */}
      {hasGrid && lockers.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={autoFillRemaining}
            disabled={pool.length === 0}
            className="px-2.5 py-1 rounded-full text-[11.5px] font-semibold border border-[#6B7B3A] text-[#6B7B3A] dark:text-[#A8B87A] dark:border-[#A8B87A] hover:bg-[#6B7B3A]/5 disabled:opacity-40 disabled:cursor-not-allowed"
            title="배치된 락커 6개 이상이면 그 순서·방향을 학습해 같은 규칙으로 이어서 배치, 6개 미만이면 왼쪽 위부터 채워요"
          >
            + 나머지 자동 배치
          </button>
          <button
            type="button"
            onClick={autoArrangeAll}
            className="px-2.5 py-1 rounded-full text-[11.5px] font-medium border border-[#B47B2A] text-[#B47B2A] dark:text-amber-300 dark:border-amber-300 hover:bg-amber-50/60"
            title="현재 배치를 지우고 번호순으로 다시 정렬해요"
          >
            ↺ 번호순 전체 재정렬
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="px-2.5 py-1 rounded-full text-[11.5px] font-medium border border-[#E8E0D0] dark:border-zinc-700 text-[#6B5D47] dark:text-zinc-400 hover:border-red-300 hover:text-red-600"
            title="현재 배치를 전부 비워요"
          >
            × 전부 비우기
          </button>
          <span className="text-[11px] text-[#A89B80] ml-1">
            일부만 원하는 자리에 배치한 뒤 &quot;자동 채우기&quot; 를 누르면 나머지가 자동으로 정렬됩니다.
          </span>
        </div>
      )}

      {/* 미배치 락커 풀 */}
      {pool.length > 0 && (
        <div className="px-3 py-2.5 rounded-lg border border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FBF7EB]/40 dark:bg-zinc-900/40">
          <div className="text-[11.5px] font-medium text-[#6B5D47] dark:text-zinc-400 mb-1.5">
            락커 선택 후 아래 그리드 셀 클릭
          </div>
          <div className="flex flex-wrap gap-1.5">
            {pool.map((l) => {
              const picked = pickedForPlace === l.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => onPick(picked ? null : l.id)}
                  className={`min-w-[36px] px-2 py-1 rounded-md border text-[11.5px] font-semibold transition-colors
                    ${picked
                      ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
                      : "border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-200 hover:border-[#6B7B3A]/40"
                    }`}
                >
                  {l.number}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 그리드 */}
      {!hasGrid ? (
        <EmptyState>
          위에서 행·열 갯수를 1 이상으로 입력하면 그리드가 나타나요.
        </EmptyState>
      ) : (
        <div
          className="grid gap-1 max-w-full"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            const l = lockerAt.get(`${r}-${c}`);
            if (l) {
              const ds = getDisplayState(l, today);
              const tileCls =
                ds === "unassigned"
                  ? "border-yellow-300 bg-yellow-100 text-yellow-700 dark:border-yellow-500/40 dark:bg-yellow-400/10 dark:text-yellow-200"
                  : ds === "active"
                  ? "border-[#6B7B3A]/40 bg-[#6B7B3A]/10 text-[#3A342A]"
                  : ds === "expiring"
                  ? "border-red-300 bg-red-50 text-red-700"
                  : ds === "expired"
                  ? "border-zinc-300 bg-zinc-300/70 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500"
                  : ds === "broken"
                  ? "border-zinc-500 bg-zinc-200 text-zinc-700"
                  : "border-amber-300 bg-amber-50 text-amber-800";
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => cellClick(r, c)}
                  title={`클릭하면 ${l.number}번 락커를 미배치로 되돌립니다`}
                  className={`aspect-square rounded-md border-2 text-[11.5px] font-bold flex items-center justify-center hover:border-red-400 ${tileCls}`}
                >
                  {l.number}
                </button>
              );
            }
            const isTarget = pickedForPlace !== null;
            return (
              <button
                key={`${r}-${c}`}
                type="button"
                onClick={() => cellClick(r, c)}
                disabled={!isTarget}
                className={`aspect-square rounded-md border transition-colors
                  ${isTarget
                    ? "border-dashed border-[#6B7B3A] bg-[#6B7B3A]/5 hover:bg-[#6B7B3A]/15 cursor-pointer"
                    : "border-dashed border-[#E8E0D0]/60 dark:border-zinc-800 bg-transparent"
                  }`}
              />
            );
          })}
        </div>
      )}

      <p className="text-[11.5px] text-[#A89B80]">
        미배치 락커를 클릭해 선택한 뒤 빈 셀을 클릭하면 그곳에 배치됩니다. 이미 놓인 락커를 클릭하면 다시 미배치로 돌아가요.
      </p>
    </div>
  );
}

function LegendChip({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-3 h-3 rounded border ${className}`} />
      <span>{label}</span>
    </span>
  );
}

function dotColor(key: string, active: boolean): string {
  if (active) return "bg-white";
  switch (key) {
    case "all": return "bg-[#B47B2A]";
    case "active": return "bg-emerald-500";
    case "expiring": return "bg-red-500";
    case "reserved": return "bg-amber-400";
    case "unassigned": return "bg-[#A89B80]";
    case "expired": return "bg-[#8C8270]";
    case "broken": return "bg-zinc-600";
    default: return "bg-[#A89B80]";
  }
}
