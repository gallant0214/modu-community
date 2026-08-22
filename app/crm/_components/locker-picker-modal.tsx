"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { CrmModal } from "./crm-modal";

/** 락커 배치도에서 빈 락커를 선택하는 큰 모달 (락커 관리 페이지와 동일한 배치 모양). */

type LockerState = "unassigned" | "assigned" | "broken";
type DisplayState = "unassigned" | "active" | "expiring" | "reserved" | "expired" | "broken";
const EXPIRING_DAYS = 7;

interface PickerLocker {
  id: number;
  number: number;
  state: LockerState;
  start_date: string | null;
  expires_at: string | null;
  layout_row: number | null;
  layout_col: number | null;
}
interface PickerZone {
  zone_number: number;
  name: string;
  layout_rows?: number;
  layout_cols?: number;
}

function getDisplayState(l: PickerLocker, today: string): DisplayState {
  if (l.state === "broken") return "broken";
  if (l.state === "unassigned") return "unassigned";
  if (!l.expires_at) return "active";
  if (l.start_date && l.start_date > today) return "reserved";
  if (l.expires_at < today) return "expired";
  const diffDays = Math.floor(
    (new Date(l.expires_at).getTime() - new Date(today).getTime()) / (24 * 3600 * 1000)
  );
  if (diffDays <= EXPIRING_DAYS) return "expiring";
  return "active";
}
function expireShort(ymd: string | null): string {
  if (!ymd) return "";
  const m = ymd.slice(0, 10).split("-");
  return m.length === 3 ? `${m[0].slice(2)}.${m[1]}.${m[2]}` : "";
}
function buildLayoutMap(lockers: PickerLocker[], rows: number, cols: number): Map<string, PickerLocker> {
  const map = new Map<string, PickerLocker>();
  if (rows <= 0 || cols <= 0) return map;
  for (const l of lockers) {
    if (l.layout_row !== null && l.layout_col !== null) map.set(`${l.layout_row}-${l.layout_col}`, l);
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
function cellCls(ds: DisplayState): string {
  return ds === "unassigned"
    ? "border-yellow-300 bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:border-yellow-500/40 dark:bg-yellow-400/10 dark:text-yellow-200 cursor-pointer"
    : ds === "active"
      ? "border-emerald-500 bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-500"
      : ds === "expiring"
        ? "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
        : ds === "expired"
          ? "border-zinc-300 bg-zinc-300/70 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500"
          : ds === "broken"
            ? "border-zinc-500 bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
            : "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
}

export function LockerPickerModal({
  open,
  zone,
  onPick,
  onClose,
  excludeLockerId,
}: {
  open: boolean;
  zone: number | null;
  onPick: (l: { id: number; number: number; zone_name: string }) => void;
  onClose: () => void;
  /** 이동 시 원본 락커 제외 */
  excludeLockerId?: number | null;
}) {
  const { getIdToken } = useAuth();
  const [lockers, setLockers] = useState<PickerLocker[]>([]);
  const [zoneInfo, setZoneInfo] = useState<PickerZone | null>(null);
  const [loading, setLoading] = useState(false);
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  const load = useCallback(async () => {
    if (zone == null) return;
    setLoading(true);
    try {
      const token = await getIdToken();
      const headers = { authorization: `Bearer ${token}` };
      const [lRes, zRes] = await Promise.all([
        fetch(`/api/crm/lockers?zone=${zone}`, { headers, cache: "no-store" }),
        fetch(`/api/crm/lockers/zones`, { headers, cache: "no-store" }),
      ]);
      if (lRes.ok) setLockers((await lRes.json()).lockers ?? []);
      if (zRes.ok) {
        const zs: PickerZone[] = (await zRes.json()).zones ?? [];
        setZoneInfo(zs.find((z) => z.zone_number === zone) ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [zone, getIdToken]);

  useEffect(() => {
    if (open && zone != null) load();
  }, [open, zone, load]);

  const zoneName = zoneInfo?.name ?? (zone != null ? `구역 ${zone}` : "");
  const rows = zoneInfo?.layout_rows ?? 0;
  const cols = zoneInfo?.layout_cols ?? 0;
  const useGrid = rows > 0 && cols > 0;
  const layoutMap = useMemo(() => buildLayoutMap(lockers, rows, cols), [lockers, rows, cols]);

  const pick = (l: PickerLocker) => {
    if (getDisplayState(l, today) !== "unassigned") return; // 빈 락커만 선택 가능
    onPick({ id: l.id, number: l.number, zone_name: zoneName });
  };

  const cell = (l: PickerLocker) => {
    const ds = getDisplayState(l, today);
    const vacant = ds === "unassigned";
    return (
      <button
        key={l.id}
        type="button"
        disabled={!vacant}
        onClick={() => pick(l)}
        className={`aspect-square rounded-lg border font-bold flex flex-col items-center justify-center leading-none transition-colors ${cellCls(ds)} ${vacant ? "" : "opacity-70 cursor-not-allowed"}`}
      >
        <span className="text-[13.5px]">{l.number}</span>
        {l.expires_at && (
          <span className="mt-0.5 text-[8px] font-medium opacity-75">~{expireShort(l.expires_at)}</span>
        )}
      </button>
    );
  };

  const visible = lockers.filter((l) => l.id !== excludeLockerId);

  return (
    <CrmModal open={open} onClose={onClose} title={`락커 선택 · ${zoneName}`} size="xl">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-[#6B5D47] dark:text-zinc-400">
          <Legend cls="border-yellow-300 bg-yellow-100 text-yellow-700" label="빈 락커(선택 가능)" />
          <Legend cls="border-emerald-500 bg-emerald-100 text-emerald-900" label="사용중" />
          <Legend cls="border-zinc-300 bg-zinc-300/70 text-zinc-500" label="만료" />
          <Legend cls="border-zinc-500 bg-zinc-200 text-zinc-700" label="고장" />
        </div>
        {loading ? (
          <div className="py-10 text-center text-[13px] text-[#8C8270]">불러오는 중…</div>
        ) : visible.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-[#8C8270]">이 구역에 락커가 없어요.</div>
        ) : (
          <div className="max-h-[62vh] overflow-auto">
            {useGrid ? (
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(56px, 96px))` }}
              >
                {Array.from({ length: rows * cols }, (_, i) => {
                  const r = Math.floor(i / cols);
                  const c = i % cols;
                  const l = layoutMap.get(`${r}-${c}`);
                  if (!l || l.id === excludeLockerId) {
                    return (
                      <div
                        key={`${r}-${c}`}
                        className="aspect-square rounded-lg border border-dashed border-[#E8E0D0]/40 dark:border-zinc-800/40"
                      />
                    );
                  }
                  return cell(l);
                })}
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                {visible.map((l) => cell(l))}
              </div>
            )}
          </div>
        )}
        <div className="text-[11.5px] text-[#A89B80]">노란색(빈 락커)만 선택할 수 있어요.</div>
      </div>
    </CrmModal>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block w-3.5 h-3.5 rounded border ${cls}`} />
      {label}
    </span>
  );
}
