"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import {
  RESERVATION_STATUS_LABEL,
  RESERVATION_STATUS_COLOR,
} from "../_components/crm-labels";

interface Reservation {
  id: number;
  pass_id: number;
  member_id: number;
  member_name: string;
  trainer_member_id: number;
  starts_at: string;
  ends_at: string;
  status: string;
  consumed: boolean;
  attended_at: string | null;
}

interface StaffOption {
  id: number;
  display_name: string;
  role: string;
  status: string;
}

type ViewMode = "day" | "week" | "month";

const SLOT_MINUTES = 30;
const SLOT_HEIGHT_PX = 28;
const WORK_START_HOUR = 8;
const WORK_END_HOUR = 23;

export default function CrmSchedulePage() {
  const { getIdToken } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, 10));
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Reservation | null>(null);

  const range = useMemo(() => computeRange(viewMode, anchor), [viewMode, anchor]);
  const rangeLabel = useMemo(() => formatRangeLabel(viewMode, anchor, range), [viewMode, anchor, range]);

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch(
        `/api/crm/reservations?from=${range.from}&to=${range.to}`,
        { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setReservations(data.reservations ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, range.from, range.to]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/crm/staff", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStaff((data.staff ?? []).filter((s: StaffOption) => s.status === "active"));
      }
    })();
  }, [getIdToken]);

  const trainers = useMemo(
    () => staff.filter((s) => s.role === "trainer" || s.role === "manager" || s.role === "owner" || s.role === "admin"),
    [staff]
  );

  const navigate = (dir: -1 | 1) => {
    const d = new Date(anchor);
    if (viewMode === "day") d.setDate(d.getDate() + dir);
    else if (viewMode === "week") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setAnchor(d.toISOString().slice(0, 10));
  };

  return (
    <div className="px-3 md:px-5 pt-2 pb-5 md:pt-3 md:pb-6 max-w-[1400px] mx-auto">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
          스케줄 관리
        </h1>

        {/* 뷰 모드 토글 */}
        <div className="inline-flex border border-[#E8E0D0] dark:border-zinc-700 rounded-lg overflow-hidden">
          {(["day", "week", "month"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`px-3 py-1.5 text-[12.5px] font-medium transition-colors
                ${viewMode === m
                  ? "bg-[#6B7B3A] text-white"
                  : "bg-[#FEFCF7] dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
                }`}
            >
              {m === "day" ? "일" : m === "week" ? "주" : "월"}
            </button>
          ))}
        </div>

        <input
          type="date"
          value={anchor}
          onChange={(e) => setAnchor(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[13px] text-[#2A251D] dark:text-zinc-100"
        />

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => navigate(-1)}
            className="px-2 py-1 rounded text-[12.5px] text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
          >
            ‹ 이전
          </button>
          <button
            onClick={() => setAnchor(new Date().toISOString().slice(0, 10))}
            className="px-2 py-1 rounded text-[12.5px] text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
          >
            오늘
          </button>
          <button
            onClick={() => navigate(1)}
            className="px-2 py-1 rounded text-[12.5px] text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
          >
            다음 ›
          </button>
        </div>
      </header>

      <div className="mb-3 text-[13px] text-[#6B5D47] dark:text-zinc-400">
        {rangeLabel} · 예약 {reservations.length}건
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : viewMode === "day" ? (
        <DayView trainers={trainers} reservations={reservations} onPick={setPicked} />
      ) : viewMode === "week" ? (
        <WeekView anchor={anchor} reservations={reservations} onPick={setPicked} />
      ) : (
        <MonthView
          anchor={anchor}
          reservations={reservations}
          onPickDate={(d) => {
            setAnchor(d);
            setViewMode("day");
          }}
        />
      )}

      {picked && (
        <ReservationDialog
          reservation={picked}
          onClose={() => setPicked(null)}
          onChange={async (next, reason) => {
            const token = await getIdToken();
            const res = await fetch(`/api/crm/reservations/${picked.id}`, {
              method: "PATCH",
              headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
              body: JSON.stringify({ status: next, reason }),
            });
            const data = await res.json();
            if (!res.ok) {
              alert(data?.error || "수정 실패");
              return;
            }
            setPicked(null);
            load();
          }}
        />
      )}
    </div>
  );
}

/* ─── Day View (강사 × 시간 그리드) ────────────────────────────── */

function DayView({
  trainers,
  reservations,
  onPick,
}: {
  trainers: StaffOption[];
  reservations: Reservation[];
  onPick: (r: Reservation) => void;
}) {
  const slots = useMemo(() => {
    const arr: { h: number; m: number; label: string }[] = [];
    for (let h = WORK_START_HOUR; h < WORK_END_HOUR; h++) {
      for (let m = 0; m < 60; m += SLOT_MINUTES) {
        arr.push({ h, m, label: `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}` });
      }
    }
    return arr;
  }, []);
  const totalRows = slots.length;
  const gridHeightPx = totalRows * SLOT_HEIGHT_PX;

  const offsetPx = (iso: string) => {
    const { h, m } = kstParts(iso);
    const minutesFromStart = (h - WORK_START_HOUR) * 60 + m;
    return (minutesFromStart / SLOT_MINUTES) * SLOT_HEIGHT_PX;
  };

  if (trainers.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-[13px] text-[#8C8270] border border-dashed border-[#E8E0D0] rounded-xl">
        가입된 강사가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
      <div className="min-w-[640px]">
        <div
          className="grid border-b border-[#E8E0D0] dark:border-zinc-800 bg-[#FBF7EB] dark:bg-zinc-900/80 sticky top-0 z-10"
          style={{ gridTemplateColumns: `64px repeat(${trainers.length}, minmax(120px, 1fr))` }}
        >
          <div className="px-2 py-2 text-[11px] font-medium text-[#A89B80]">시간</div>
          {trainers.map((t) => (
            <div
              key={t.id}
              className="px-3 py-2 text-[12.5px] font-semibold text-[#2A251D] dark:text-zinc-100 border-l border-[#E8E0D0]/70 dark:border-zinc-800 truncate"
            >
              {t.display_name}
            </div>
          ))}
        </div>

        <div
          className="relative grid"
          style={{
            gridTemplateColumns: `64px repeat(${trainers.length}, minmax(120px, 1fr))`,
            height: `${gridHeightPx}px`,
          }}
        >
          <div className="relative border-r border-[#E8E0D0] dark:border-zinc-800">
            {slots.map((s, i) => (
              <div
                key={i}
                className="border-b border-[#E8E0D0]/40 dark:border-zinc-800/40 text-[10.5px] text-[#A89B80] dark:text-zinc-500 px-1 leading-none flex items-start"
                style={{ height: `${SLOT_HEIGHT_PX}px` }}
              >
                {s.m === 0 && <span className="pt-1">{s.label}</span>}
              </div>
            ))}
          </div>

          {trainers.map((t) => {
            const list = reservations.filter((r) => r.trainer_member_id === t.id);
            return (
              <div key={t.id} className="relative border-l border-[#E8E0D0]/70 dark:border-zinc-800">
                {slots.map((_, i) => (
                  <div
                    key={i}
                    className="border-b border-[#E8E0D0]/30 dark:border-zinc-800/30"
                    style={{ height: `${SLOT_HEIGHT_PX}px` }}
                  />
                ))}
                {list.map((r) => {
                  const top = offsetPx(r.starts_at);
                  const bottom = offsetPx(r.ends_at);
                  const height = Math.max(SLOT_HEIGHT_PX * 0.9, bottom - top);
                  const color = RESERVATION_STATUS_COLOR[r.status] ?? RESERVATION_STATUS_COLOR.booked;
                  return (
                    <button
                      key={r.id}
                      onClick={() => onPick(r)}
                      className={`absolute left-1 right-1 px-2 py-1 rounded-md text-left text-[11.5px] font-medium border ${color.bg} ${color.text}`}
                      style={{ top: `${top}px`, height: `${height}px` }}
                    >
                      <div className="truncate font-semibold">{r.member_name || "회원"}</div>
                      <div className="truncate text-[10.5px] opacity-80">
                        {RESERVATION_STATUS_LABEL[r.status]}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Week View (7일 × 시간 그리드) ────────────────────────────── */

function WeekView({
  anchor,
  reservations,
  onPick,
}: {
  anchor: string;
  reservations: Reservation[];
  onPick: (r: Reservation) => void;
}) {
  const days = useMemo(() => {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [anchor]);

  const slots = useMemo(() => {
    const arr: { h: number; m: number; label: string }[] = [];
    for (let h = WORK_START_HOUR; h < WORK_END_HOUR; h++) {
      for (let m = 0; m < 60; m += SLOT_MINUTES) {
        arr.push({ h, m, label: `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}` });
      }
    }
    return arr;
  }, []);
  const gridHeightPx = slots.length * SLOT_HEIGHT_PX;

  const offsetPx = (iso: string) => {
    const { h, m } = kstParts(iso);
    const minutesFromStart = (h - WORK_START_HOUR) * 60 + m;
    return (minutesFromStart / SLOT_MINUTES) * SLOT_HEIGHT_PX;
  };

  const dayKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  return (
    <div className="overflow-x-auto rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
      <div className="min-w-[840px]">
        <div
          className="grid border-b border-[#E8E0D0] dark:border-zinc-800 bg-[#FBF7EB] dark:bg-zinc-900/80 sticky top-0 z-10"
          style={{ gridTemplateColumns: `56px repeat(7, minmax(100px, 1fr))` }}
        >
          <div className="px-2 py-2 text-[11px] font-medium text-[#A89B80]">시간</div>
          {days.map((d, i) => (
            <div
              key={i}
              className={`px-3 py-2 text-[12.5px] font-semibold text-[#2A251D] dark:text-zinc-100 border-l border-[#E8E0D0]/70 dark:border-zinc-800 ${isToday(d) ? "text-[#6B7B3A] dark:text-[#A8B87A]" : ""}`}
            >
              <div>{["일", "월", "화", "수", "목", "금", "토"][d.getDay()]}</div>
              <div className="text-[11px] font-normal text-[#A89B80]">
                {d.getMonth() + 1}/{d.getDate()}
              </div>
            </div>
          ))}
        </div>

        <div
          className="relative grid"
          style={{
            gridTemplateColumns: `56px repeat(7, minmax(100px, 1fr))`,
            height: `${gridHeightPx}px`,
          }}
        >
          <div className="relative border-r border-[#E8E0D0] dark:border-zinc-800">
            {slots.map((s, i) => (
              <div
                key={i}
                className="border-b border-[#E8E0D0]/40 dark:border-zinc-800/40 text-[10.5px] text-[#A89B80] px-1 leading-none flex items-start"
                style={{ height: `${SLOT_HEIGHT_PX}px` }}
              >
                {s.m === 0 && <span className="pt-1">{s.label}</span>}
              </div>
            ))}
          </div>

          {days.map((d, di) => {
            const key = dayKey(d);
            const list = reservations.filter((r) => kstDateKey(r.starts_at) === key);
            return (
              <div key={di} className="relative border-l border-[#E8E0D0]/70 dark:border-zinc-800">
                {slots.map((_, i) => (
                  <div
                    key={i}
                    className="border-b border-[#E8E0D0]/30 dark:border-zinc-800/30"
                    style={{ height: `${SLOT_HEIGHT_PX}px` }}
                  />
                ))}
                {list.map((r) => {
                  const top = offsetPx(r.starts_at);
                  const bottom = offsetPx(r.ends_at);
                  const height = Math.max(SLOT_HEIGHT_PX * 0.9, bottom - top);
                  const color = RESERVATION_STATUS_COLOR[r.status] ?? RESERVATION_STATUS_COLOR.booked;
                  return (
                    <button
                      key={r.id}
                      onClick={() => onPick(r)}
                      className={`absolute left-1 right-1 px-1.5 py-0.5 rounded text-left text-[11px] font-medium border ${color.bg} ${color.text}`}
                      style={{ top: `${top}px`, height: `${height}px` }}
                    >
                      <div className="truncate font-semibold">{r.member_name || "회원"}</div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Month View (6×7 달력) ────────────────────────────── */

function MonthView({
  anchor,
  reservations,
  onPickDate,
}: {
  anchor: string;
  reservations: Reservation[];
  onPickDate: (date: string) => void;
}) {
  const cells = useMemo(() => buildMonthCells(anchor), [anchor]);

  // 날짜별 카운트 + 상태별 분포
  const byDate = useMemo(() => {
    const m = new Map<string, { total: number; attended: number; cancelled: number; booked: number; noshow: number }>();
    for (const r of reservations) {
      const k = kstDateKey(r.starts_at);
      const cur = m.get(k) ?? { total: 0, attended: 0, cancelled: 0, booked: 0, noshow: 0 };
      cur.total += 1;
      if (r.status in cur) (cur as Record<string, number>)[r.status] += 1;
      m.set(k, cur);
    }
    return m;
  }, [reservations]);

  return (
    <div className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 overflow-hidden">
      <div
        className="grid bg-[#FBF7EB] dark:bg-zinc-900/80 border-b border-[#E8E0D0] dark:border-zinc-800"
        style={{ gridTemplateColumns: "repeat(7, 1fr)" }}
      >
        {["일", "월", "화", "수", "목", "금", "토"].map((dow, i) => (
          <div
            key={i}
            className={`px-2 py-2 text-[11.5px] font-medium ${i === 0 ? "text-red-600" : i === 6 ? "text-blue-600" : "text-[#A89B80]"}`}
          >
            {dow}
          </div>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
        {cells.map((c, i) => {
          const stats = byDate.get(c.key);
          return (
            <button
              key={i}
              onClick={() => onPickDate(c.key)}
              className={`text-left min-h-[78px] px-2 py-1.5 border-r border-b border-[#E8E0D0]/60 dark:border-zinc-800/60
                ${c.isCurrentMonth ? "bg-[#FEFCF7] dark:bg-zinc-900" : "bg-[#FBF7EB]/40 dark:bg-zinc-900/40"}
                hover:bg-[#F5F0E5] dark:hover:bg-zinc-800/60`}
            >
              <div className="flex items-baseline justify-between">
                <span
                  className={`text-[12.5px] font-semibold ${
                    !c.isCurrentMonth
                      ? "text-[#A89B80]"
                      : c.dayOfWeek === 0
                      ? "text-red-600"
                      : c.dayOfWeek === 6
                      ? "text-blue-600"
                      : "text-[#2A251D] dark:text-zinc-100"
                  } ${c.isToday ? "px-1.5 py-0.5 rounded-full bg-[#6B7B3A] text-white" : ""}`}
                >
                  {c.day}
                </span>
                {stats && (
                  <span className="text-[10.5px] text-[#6B7B3A] font-semibold">
                    {stats.total}건
                  </span>
                )}
              </div>
              {stats && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {stats.attended > 0 && (
                    <Pill color="bg-[#EFE7D5] text-[#6B7B3A]">
                      출석 {stats.attended}
                    </Pill>
                  )}
                  {stats.booked > 0 && (
                    <Pill color="bg-[#F5E4C8] text-[#B47B2A]">
                      예약 {stats.booked}
                    </Pill>
                  )}
                  {stats.noshow > 0 && (
                    <Pill color="bg-red-50 text-red-700">노쇼 {stats.noshow}</Pill>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${color}`}>
      {children}
    </span>
  );
}

/* ─── 다이얼로그 ────────────────────────────── */

function ReservationDialog({
  reservation,
  onClose,
  onChange,
}: {
  reservation: Reservation;
  onClose: () => void;
  onChange: (next: string, reason?: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-950 shadow-xl p-5">
        <h2 className="text-[15px] font-semibold text-[#2A251D] dark:text-zinc-100">예약 상세</h2>
        <div className="mt-2 text-[13px] text-[#6B5D47] dark:text-zinc-400">
          <div>
            <span className="font-medium">{reservation.member_name || "회원"}</span>
          </div>
          <div className="text-[12px] text-[#8C8270] mt-0.5">
            {formatDateTimeKST(reservation.starts_at)} ~ {formatTimeKST(reservation.ends_at)} ·{" "}
            {RESERVATION_STATUS_LABEL[reservation.status]}
            {reservation.consumed && <span className="ml-1 text-[#B47B2A]">· 차감됨</span>}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <ActionBtn label="출석 완료" onClick={() => onChange("attended")} color="green" />
            <ActionBtn label="예약 완료로 되돌리기" onClick={() => onChange("booked")} color="neutral" />
            <ActionBtn label="예약 취소(미차감)" onClick={() => onChange("cancelled", reason)} color="neutral" />
            <ActionBtn label="노쇼(차감 취소)" onClick={() => onChange("noshow", reason)} color="red" />
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="취소·노쇼 사유 (선택)"
            className="w-full px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[12.5px] text-[#2A251D] dark:text-zinc-100"
          />
          <button
            onClick={onClose}
            className="w-full px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13px] text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  color,
}: {
  label: string;
  onClick: () => void;
  color: "green" | "red" | "neutral";
}) {
  const cls =
    color === "green"
      ? "border-[#6B7B3A] text-[#6B7B3A] hover:bg-[#6B7B3A]/5"
      : color === "red"
      ? "border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300"
      : "border-[#E8E0D0] text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 dark:border-zinc-700";
  return (
    <button onClick={onClick} className={`px-2.5 py-2 rounded-lg border text-[12.5px] font-medium ${cls}`}>
      {label}
    </button>
  );
}

/* ─── 유틸 ────────────────────────────── */

function computeRange(view: ViewMode, anchor: string): { from: string; to: string } {
  if (view === "day") {
    return { from: anchor, to: anchor };
  }
  if (view === "week") {
    const start = startOfWeek(anchor);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { from: ymd(start), to: ymd(end) };
  }
  // month: 달력 6주 전부 (이전·다음달 일부 포함)
  const cells = buildMonthCells(anchor);
  return { from: cells[0].key, to: cells[cells.length - 1].key };
}

function formatRangeLabel(view: ViewMode, anchor: string, range: { from: string; to: string }) {
  if (view === "day") {
    const d = new Date(anchor);
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${["일", "월", "화", "수", "목", "금", "토"][d.getDay()]})`;
  }
  if (view === "week") {
    const start = new Date(range.from);
    const end = new Date(range.to);
    return `${start.getMonth() + 1}월 ${start.getDate()}일 ~ ${end.getMonth() + 1}월 ${end.getDate()}일`;
  }
  const d = new Date(anchor);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

function startOfWeek(dateStr: string): Date {
  const d = new Date(dateStr);
  const day = d.getDay(); // 0=일
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildMonthCells(anchor: string) {
  const d = new Date(anchor);
  const year = d.getFullYear();
  const month = d.getMonth();
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const cells: {
    key: string;
    day: number;
    isCurrentMonth: boolean;
    isToday: boolean;
    dayOfWeek: number;
  }[] = [];
  const todayKey = ymd(new Date());
  for (let i = 0; i < 42; i++) {
    const date = new Date(year, month, 1 - startDay + i);
    const key = ymd(date);
    cells.push({
      key,
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === month,
      isToday: key === todayKey,
      dayOfWeek: date.getDay(),
    });
  }
  return cells;
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isToday(d: Date) {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

function kstParts(iso: string) {
  const d = new Date(iso);
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return { h: k.getUTCHours(), m: k.getUTCMinutes() };
}

function kstDateKey(iso: string) {
  const d = new Date(iso);
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}-${String(k.getUTCDate()).padStart(2, "0")}`;
}

function formatTimeKST(iso: string) {
  const { h, m } = kstParts(iso);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function formatDateTimeKST(iso: string) {
  const d = new Date(iso);
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${formatTimeKST(iso)}`;
}
