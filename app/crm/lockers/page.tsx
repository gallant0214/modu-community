"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { CrmModal, CrmField, crmInputClass } from "../_components/crm-modal";
import { formatPhone } from "../_components/crm-labels";

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
  member: { id: number; name: string; phone: string | null } | null;
}

const STATE_FILTERS: { key: "all" | DisplayState; label: string; color: string }[] = [
  { key: "all",        label: "전체",    color: "bg-[#B47B2A] text-white" },
  { key: "active",     label: "활성",    color: "bg-[#6B7B3A] text-white" },
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
  active:     "bg-[#6B7B3A]/20 text-[#6B7B3A] dark:text-[#A8B87A]",
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
  const [today] = useState(() => new Date().toISOString().slice(0, 10));

  // 필터
  const [filter, setFilter] = useState<"all" | DisplayState>("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("box");
  const [pickedLocker, setPickedLocker] = useState<Locker | null>(null);
  const [moveSource, setMoveSource] = useState<Locker | null>(null);

  // 설정 폼
  const [zoneName, setZoneName] = useState("");
  const [lockerCount, setLockerCount] = useState("");
  const [startNumber, setStartNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

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
    if (tab === "assigned") loadLockers();
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
    } else {
      setZoneName(`구역 ${zone}`);
      setLockerCount("");
      setStartNumber("");
    }
    setSavedMsg("");
  }, [currentZone, zone]);

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

  return (
    <div className="px-5 md:px-8 pt-2 pb-6 md:pt-3 md:pb-8 max-w-6xl mx-auto">
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
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1.5">
              {filtered.map((l) => {
                const ds = getDisplayState(l, today);
                return (
                  <button
                    key={l.id}
                    onClick={() => setPickedLocker(l)}
                    className={`aspect-square rounded-lg border text-[13.5px] font-bold flex items-center justify-center transition-colors
                      ${ds === "unassigned"
                        ? "border-dashed border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB]/40 dark:bg-zinc-900/40 text-[#A89B80] hover:border-[#6B7B3A]/40"
                        : ds === "active"
                        ? "border-[#6B7B3A]/40 bg-[#6B7B3A]/10 text-[#3A342A] dark:text-zinc-100 hover:bg-[#6B7B3A]/20"
                        : ds === "expiring"
                        ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300"
                        : ds === "expired"
                        ? "border-[#E8E0D0] bg-[#F5F0E5] text-[#8C8270]"
                        : ds === "broken"
                        ? "border-zinc-500 bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
                        : "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                      }`}
                  >
                    {l.number}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
              {filtered.map((l) => (
                <LockerCard
                  key={l.id}
                  locker={l}
                  today={today}
                  onClick={() => setPickedLocker(l)}
                />
              ))}
            </div>
          )}

          {error && (
            <div className="mt-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
        </>
      )}

      {tab === "unassigned" && <UnassignedTab zone={zone} zoneLabel={zoneLabel} onZoneChange={setZone} onAssigned={loadLockers} />}

      {tab === "returns" && <ReturnsTab zone={zone} zoneLabel={zoneLabel} onZoneChange={setZone} />}

      {tab === "settings" && (
        <>
          <ZoneChips zone={zone} onChange={setZone} zoneLabel={zoneLabel} />

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
            <h2 className="text-[14.5px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-3">
              락커 배치도
            </h2>
            <EmptyState>데이터가 없어요</EmptyState>
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
            className="w-full px-4 py-3 rounded-lg bg-[#6B7B3A] disabled:opacity-50 text-white text-[14.5px] font-semibold hover:bg-[#5a6932] transition-colors"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </>
      )}

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
}: {
  locker: Locker;
  today: string;
  onClick: () => void;
}) {
  const ds = getDisplayState(locker, today);
  const isEmpty = ds === "unassigned" || ds === "broken";

  return (
    <button
      onClick={onClick}
      className={`text-left p-3 rounded-xl border transition-colors min-h-[110px] flex flex-col
        ${isEmpty
          ? "border-dashed border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB]/40 dark:bg-zinc-900/40 hover:border-[#6B7B3A]/40"
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
            <div className="mt-auto text-[11.5px] text-[#8C8270] dark:text-zinc-500">
              ~{locker.expires_at}
              <br />
              {expireSubtitle(locker.expires_at, today)}
            </div>
          )}
        </>
      ) : (
        <div className="mt-auto mx-auto text-[#A89B80] dark:text-zinc-500 text-[22px]">+</div>
      )}
    </button>
  );
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

function ReturnsTab({ zone, onZoneChange, zoneLabel }: { zone: number; zoneLabel: (n: number) => string; onZoneChange: (n: number) => void }) {
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
}: {
  locker: Locker | null;
  today: string;
  onClose: () => void;
  onDone: () => void;
  onMove?: (locker: Locker) => void;
}) {
  const { getIdToken } = useAuth();
  const open = locker !== null;
  const ds = locker ? getDisplayState(locker, today) : "unassigned";
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"view" | "assign" | "history">("view");
  const [history, setHistory] = useState<
    { id: number; action: string; member_name: string | null; created_at: string; note: string | null }[]
  >([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

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

  useEffect(() => {
    if (!open) {
      setMode("view");
      setError("");
      setMemberQuery("");
      setMemberResults([]);
      setPickedMember(null);
      setPassword("");
      setMemo("");
      setHistory([]);
      return;
    }
    if (locker) {
      setPassword(locker.password ?? "");
      setMemo(locker.memo ?? "");
    }
  }, [open, locker]);

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

  return (
    <CrmModal
      open={open}
      onClose={onClose}
      title={`락커 ${locker.number}번`}
      size="md"
    >
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <span className={`px-2 py-0.5 rounded text-[11.5px] font-semibold ${STATE_CHIP_CLS[ds]}`}>
            {STATE_LABEL[ds]}
          </span>
          {locker.member && (
            <span className="text-[13px] font-semibold text-[#2A251D] dark:text-zinc-100">
              {locker.member.name}
              {locker.member.phone && (
                <span className="ml-1 text-[12px] text-[#8C8270] font-normal">
                  · {formatPhone(locker.member.phone)}
                </span>
              )}
            </span>
          )}
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
              <ul className="space-y-1.5 max-h-[260px] overflow-y-auto">
                {history.map((h) => (
                  <li
                    key={h.id}
                    className="px-3 py-2 rounded-lg border border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FBF7EB]/40 dark:bg-zinc-900/40"
                  >
                    <div className="flex items-baseline justify-between gap-2">
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
                    {h.note && (
                      <div className="mt-1 text-[11.5px] text-[#8C8270] dark:text-zinc-500 truncate">
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
            {/* 정보 (배정된 경우) */}
            {locker.state === "assigned" && (
              <dl className="grid grid-cols-[80px_1fr] gap-y-1.5 text-[13px]">
                <dt className="text-[#A89B80]">시작일</dt>
                <dd className="font-medium">{locker.start_date || "—"}</dd>
                <dt className="text-[#A89B80]">만료일</dt>
                <dd className="font-medium">
                  {locker.expires_at || "—"}
                  {locker.expires_at && (
                    <span className="ml-2 text-[11.5px] text-[#8C8270]">
                      ({expireSubtitle(locker.expires_at, today)})
                    </span>
                  )}
                </dd>
              </dl>
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
                  className="flex-1 min-w-[100px] px-4 py-2.5 rounded-lg bg-[#6B7B3A] text-white text-[13.5px] font-semibold"
                >
                  배정하기
                </button>
              )}

              {(locker.state === "assigned" || locker.state === "unassigned") && (
                <button
                  onClick={() =>
                    callAction("update", {
                      password: password || null,
                      memo: memo || null,
                    })
                  }
                  disabled={submitting}
                  className="flex-1 min-w-[100px] px-4 py-2.5 rounded-lg border border-[#6B7B3A] text-[#6B7B3A] dark:text-[#A8B87A] text-[13.5px] font-semibold hover:bg-[#6B7B3A]/5"
                >
                  비밀번호·메모 저장
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
    </CrmModal>
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

/* ─── 공통 ────────────────────────────── */

function ZoneChips({
  zone,
  onChange,
  zoneLabel,
  zones,
  showOnlyActive,
  onAddRoom,
}: {
  zone: number;
  onChange: (n: number) => void;
  zoneLabel: (n: number) => string;
  zones?: Zone[];
  showOnlyActive?: boolean;
  onAddRoom?: () => void;
}) {
  // showOnlyActive=true → locker_count>0 인 락커룸만 표시
  let numbers = Array.from({ length: ZONE_COUNT }, (_, i) => i + 1);
  if (showOnlyActive && zones) {
    const activeNums = zones
      .filter((z) => z.locker_count > 0)
      .map((z) => z.zone_number);
    numbers = activeNums.length > 0 ? activeNums : [zone];
  }

  return (
    <div className="flex items-center gap-1.5 mt-5 mb-4 overflow-x-auto -mx-1 px-1">
      {numbers.map((n) => {
        const active = zone === n;
        return (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-medium border whitespace-nowrap transition-colors
              ${active
                ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
                : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300 hover:border-[#6B7B3A]/40"
              }`}
          >
            {zoneLabel(n)}
          </button>
        );
      })}
      {onAddRoom && (
        <button
          onClick={onAddRoom}
          className="px-3 py-1.5 rounded-full text-[12.5px] font-semibold border border-dashed border-[#6B7B3A] text-[#6B7B3A] dark:text-[#A8B87A] dark:border-[#A8B87A] hover:bg-[#6B7B3A]/5 whitespace-nowrap"
        >
          + 새 락커룸
        </button>
      )}
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

function dotColor(key: string, active: boolean): string {
  if (active) return "bg-white";
  switch (key) {
    case "all": return "bg-[#B47B2A]";
    case "active": return "bg-[#6B7B3A]";
    case "expiring": return "bg-red-500";
    case "reserved": return "bg-amber-400";
    case "unassigned": return "bg-[#A89B80]";
    case "expired": return "bg-[#8C8270]";
    case "broken": return "bg-zinc-600";
    default: return "bg-[#A89B80]";
  }
}
