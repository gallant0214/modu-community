"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

interface ScheduleEvent {
  id: number;
  type: "center" | "personal";
  title: string;
  description: string | null;
  trainer_member_id: number | null;
  starts_at: string;
  ends_at: string;
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

/** 현재 KST 시각을 { ymd, minutesFromMidnight } 로 반환 */
function nowKst() {
  const d = new Date();
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const ymd = `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}-${String(k.getUTCDate()).padStart(2, "0")}`;
  const minutes = k.getUTCHours() * 60 + k.getUTCMinutes();
  return { ymd, minutes };
}
const WORK_END_HOUR = 23;

export default function CrmSchedulePage() {
  const { getIdToken } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, 10));
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [role, setRole] = useState<"owner" | "admin" | "manager" | "trainer" | null>(null);
  const [selectedTrainerId, setSelectedTrainerId] = useState<number | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Reservation | null>(null);
  const [newSlot, setNewSlot] = useState<{
    trainerId: number;
    trainerName: string;
    startsAt: string;
    endsAt: string;
  } | null>(null);

  const range = useMemo(() => computeRange(viewMode, anchor), [viewMode, anchor]);
  const rangeLabel = useMemo(() => formatRangeLabel(viewMode, anchor, range), [viewMode, anchor, range]);

  const canPickTrainer = role === "owner" || role === "admin" || role === "manager";

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const trainerQs =
        canPickTrainer && selectedTrainerId !== "all"
          ? `&trainer_id=${selectedTrainerId}`
          : "";
      const [resR, resE] = await Promise.all([
        fetch(`/api/crm/reservations?from=${range.from}&to=${range.to}${trainerQs}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        fetch(`/api/crm/schedule-events?from=${range.from}&to=${range.to}${trainerQs}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
      ]);
      const dataR = await resR.json();
      if (!resR.ok) throw new Error(dataR?.error || "예약 조회 실패");
      setReservations(dataR.reservations ?? []);
      if (resE.ok) {
        const dataE = await resE.json();
        setEvents(dataE.events ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, range.from, range.to, selectedTrainerId, canPickTrainer]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      const [resStaff, resBoot] = await Promise.all([
        fetch("/api/crm/staff", { headers: { authorization: `Bearer ${token}` } }),
        fetch("/api/crm/bootstrap", { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }),
      ]);
      if (resStaff.ok) {
        const data = await resStaff.json();
        setStaff((data.staff ?? []).filter((s: StaffOption) => s.status === "active"));
      }
      if (resBoot.ok) {
        const data = await resBoot.json();
        if (data?.role) setRole(data.role);
      }
    })();
  }, [getIdToken]);

  const trainers = useMemo(
    () => staff.filter((s) => s.role === "trainer" || s.role === "manager" || s.role === "owner" || s.role === "admin"),
    [staff]
  );

  // 드래그로 예약 시간·강사 이동
  const reschedule = useCallback(
    async (
      id: number,
      startsAt: string,
      endsAt: string,
      trainerMemberId?: number
    ) => {
      try {
        const token = await getIdToken();
        if (!token) return;
        const res = await fetch(`/api/crm/reservations/${id}`, {
          method: "PATCH",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({
            starts_at: startsAt,
            ends_at: endsAt,
            ...(trainerMemberId ? { trainer_member_id: trainerMemberId } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          alert(data?.error || "시간 이동 실패");
          return;
        }
        // 낙관적 업데이트
        setReservations((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  starts_at: data.starts_at ?? startsAt,
                  ends_at: data.ends_at ?? endsAt,
                  trainer_member_id: trainerMemberId ?? r.trainer_member_id,
                }
              : r
          )
        );
      } catch (e) {
        alert(e instanceof Error ? e.message : "네트워크 오류");
      }
    },
    [getIdToken]
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

      {/* 강사 필터 (관리자/팀장 이상만) */}
      {canPickTrainer && (viewMode === "week" || viewMode === "month") && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
            강사:
          </span>
          <select
            value={selectedTrainerId}
            onChange={(e) =>
              setSelectedTrainerId(
                e.target.value === "all" ? "all" : Number(e.target.value)
              )
            }
            className="px-2.5 py-1 rounded border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[13px] text-[#2A251D] dark:text-zinc-100"
          >
            <option value="all">전체 강사</option>
            {trainers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.display_name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mb-3 text-[13px] text-[#6B5D47] dark:text-zinc-400">
        {rangeLabel} · 예약 {reservations.length}건 · 일정 {events.length}건
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : viewMode === "day" ? (
        <DayView
          trainers={trainers}
          reservations={reservations}
          events={events}
          anchorDate={anchor}
          onPick={setPicked}
          onReschedule={reschedule}
          onSlotClick={(trainer, h, m) => {
            const startISO = kstDateToUTCISO(anchor, h, m, 0);
            const endISO = kstDateToUTCISO(anchor, h, m + 50, 0); // 기본 50분
            setNewSlot({
              trainerId: trainer.id,
              trainerName: trainer.display_name,
              startsAt: startISO,
              endsAt: endISO,
            });
          }}
        />
      ) : viewMode === "week" ? (
        <WeekView
          anchor={anchor}
          reservations={reservations}
          events={events}
          trainers={trainers}
          onPick={setPicked}
          onReschedule={reschedule}
          onSlotClick={(ymd, h, m, defaultTrainer) => {
            if (!defaultTrainer) return;
            setNewSlot({
              trainerId: defaultTrainer.id,
              trainerName: defaultTrainer.display_name,
              startsAt: kstDateToUTCISO(ymd, h, m),
              endsAt: kstDateToUTCISO(ymd, h, m + 50),
            });
          }}
        />
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

      {newSlot && (
        <NewReservationModal
          slot={newSlot}
          trainers={trainers}
          onChangeTrainer={(t) =>
            setNewSlot((prev) =>
              prev ? { ...prev, trainerId: t.id, trainerName: t.display_name } : prev
            )
          }
          onClose={() => setNewSlot(null)}
          onCreated={() => {
            setNewSlot(null);
            load();
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

type DayDragState = {
  id: number;
  origStartsAt: string;
  origEndsAt: string;
  origTrainerId: number;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  moved: boolean;
  anchorDate: string;
  columnRects: { trainerId: number; trainerName: string; left: number; right: number }[];
} | null;

function DayView({
  trainers,
  reservations,
  events,
  anchorDate,
  onPick,
  onSlotClick,
  onReschedule,
}: {
  trainers: StaffOption[];
  reservations: Reservation[];
  events: ScheduleEvent[];
  anchorDate: string;
  onPick: (r: Reservation) => void;
  onSlotClick: (trainer: StaffOption, h: number, m: number) => void;
  onReschedule: (id: number, startsAt: string, endsAt: string, trainerMemberId?: number) => Promise<void> | void;
}) {
  void anchorDate;
  const columnRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());
  const [drag, setDrag] = useState<DayDragState>(null);
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
        {(() => {
          const now = nowKst();
          const anchorIsToday = anchorDate === now.ymd;
          return (
            <div
              className={`grid border-b border-[#E8E0D0] dark:border-zinc-800 sticky top-0 z-10
                ${anchorIsToday
                  ? "bg-[#6B7B3A]/10 dark:bg-[#6B7B3A]/20"
                  : "bg-[#FBF7EB] dark:bg-zinc-900/80"
                }`}
              style={{ gridTemplateColumns: `64px repeat(${trainers.length}, minmax(120px, 1fr))` }}
            >
              <div className="px-2 py-2 text-[11px] font-medium text-[#A89B80] flex items-center gap-1">
                시간
                {anchorIsToday && (
                  <span className="px-1 py-0.5 rounded text-[9.5px] font-bold bg-[#6B7B3A] text-white leading-none">
                    TODAY
                  </span>
                )}
              </div>
              {trainers.map((t) => (
                <div
                  key={t.id}
                  className="px-3 py-2 text-[12.5px] font-semibold text-[#2A251D] dark:text-zinc-100 border-l border-[#E8E0D0]/70 dark:border-zinc-800 truncate"
                >
                  {t.display_name}
                </div>
              ))}
            </div>
          );
        })()}

        <div
          className="relative grid"
          style={{
            gridTemplateColumns: `64px repeat(${trainers.length}, minmax(120px, 1fr))`,
            height: `${gridHeightPx}px`,
          }}
        >
          {(() => {
            const now = nowKst();
            if (now.ymd !== anchorDate) return null;
            const min = now.minutes - WORK_START_HOUR * 60;
            if (min < 0 || min > (WORK_END_HOUR - WORK_START_HOUR) * 60) return null;
            const top = (min / SLOT_MINUTES) * SLOT_HEIGHT_PX;
            return (
              <div
                className="absolute left-0 right-0 z-20 pointer-events-none"
                style={{ top: `${top}px` }}
              >
                <div className="relative h-0.5 bg-[#4A8BE3] shadow-[0_0_4px_rgba(74,139,227,0.6)]">
                  <span className="absolute -top-1.5 -left-1 w-3 h-3 rounded-full bg-[#4A8BE3] shadow-md" />
                  <span className="absolute -top-4 left-3 text-[10.5px] font-semibold text-[#4A8BE3] bg-[#FEFCF7] dark:bg-zinc-900 px-1 rounded">
                    지금 {String(Math.floor(now.minutes / 60)).padStart(2, "0")}:
                    {String(now.minutes % 60).padStart(2, "0")}
                  </span>
                </div>
              </div>
            );
          })()}
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
            const evList = events.filter(
              (e) => e.type === "center" || e.trainer_member_id === t.id
            );
            return (
              <div
                key={t.id}
                ref={(el) => {
                  columnRefs.current.set(t.id, el);
                }}
                data-trainer-id={t.id}
                className="relative border-l border-[#E8E0D0]/70 dark:border-zinc-800"
              >
                {slots.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onSlotClick(t, s.h, s.m)}
                    title={`${t.display_name} · ${s.label} 예약 만들기`}
                    className="w-full block border-b border-[#E8E0D0]/30 dark:border-zinc-800/30 hover:bg-[#6B7B3A]/5 cursor-pointer"
                    style={{ height: `${SLOT_HEIGHT_PX}px` }}
                  />
                ))}
                {evList.map((e) => {
                  const top = offsetPx(e.starts_at);
                  const bottom = offsetPx(e.ends_at);
                  const height = Math.max(SLOT_HEIGHT_PX * 0.9, bottom - top);
                  const cls =
                    e.type === "center"
                      ? "bg-[#5A8BB0]/15 text-[#487596] border-[#5A8BB0]/40"
                      : "bg-[#8B6BAA]/15 text-[#7A5C99] border-[#8B6BAA]/40";
                  return (
                    <div
                      key={`ev-${e.id}`}
                      className={`absolute left-1 right-1 px-2 py-1 rounded-md text-left text-[11.5px] font-medium border ${cls}`}
                      style={{ top: `${top}px`, height: `${height}px` }}
                      title={e.description ?? undefined}
                    >
                      <div className="truncate font-semibold">
                        [{e.type === "center" ? "센터" : "개인"}] {e.title}
                      </div>
                    </div>
                  );
                })}
                {list.map((r) => {
                  const top = offsetPx(r.starts_at);
                  const bottom = offsetPx(r.ends_at);
                  const height = Math.max(SLOT_HEIGHT_PX * 0.9, bottom - top);
                  const color = RESERVATION_STATUS_COLOR[r.status] ?? RESERVATION_STATUS_COLOR.booked;
                  const isDragging = drag?.id === r.id && drag.moved;
                  return (
                    <button
                      key={r.id}
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        e.preventDefault();
                        startDayDrag(
                          e,
                          r,
                          anchorDate,
                          trainers,
                          columnRefs.current,
                          onPick,
                          onReschedule,
                          setDrag
                        );
                      }}
                      className={`absolute left-1 right-1 px-2 py-1 rounded-md text-left text-[11.5px] font-medium border ${color.bg} ${color.text} cursor-grab active:cursor-grabbing ${isDragging ? "opacity-40" : ""}`}
                      style={{ top: `${top}px`, height: `${height}px` }}
                    >
                      <div className="truncate font-semibold pointer-events-none">{r.member_name || "회원"}</div>
                      <div className="truncate text-[10.5px] opacity-80 pointer-events-none">
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
      {drag && drag.moved && <DayDragGhost drag={drag} />}
    </div>
  );
}

/** DayView 드래그 시작 — 컬럼 스냅샷 + document 리스너 등록 */
function startDayDrag(
  e: React.MouseEvent,
  r: Reservation,
  anchorDate: string,
  trainers: StaffOption[],
  columns: Map<number, HTMLDivElement | null>,
  onPick: (r: Reservation) => void,
  onReschedule: (id: number, startsAt: string, endsAt: string, trainerMemberId?: number) => Promise<void> | void,
  setDrag: (s: DayDragState) => void
) {
  const startX = e.clientX;
  const startY = e.clientY;
  const columnRects: { trainerId: number; trainerName: string; left: number; right: number }[] = [];
  columns.forEach((el, trainerId) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const t = trainers.find((x) => x.id === trainerId);
    columnRects.push({
      trainerId,
      trainerName: t?.display_name ?? "",
      left: rect.left,
      right: rect.right,
    });
  });
  const local = { dx: 0, dy: 0, moved: false };

  setDrag({
    id: r.id,
    origStartsAt: r.starts_at,
    origEndsAt: r.ends_at,
    origTrainerId: r.trainer_member_id,
    startX,
    startY,
    dx: 0,
    dy: 0,
    moved: false,
    anchorDate,
    columnRects,
  });

  const onMove = (ev: MouseEvent) => {
    local.dx = ev.clientX - startX;
    local.dy = ev.clientY - startY;
    local.moved = local.moved || Math.hypot(local.dx, local.dy) > 4;
    setDrag({
      id: r.id,
      origStartsAt: r.starts_at,
      origEndsAt: r.ends_at,
      origTrainerId: r.trainer_member_id,
      startX,
      startY,
      dx: local.dx,
      dy: local.dy,
      moved: local.moved,
      anchorDate,
      columnRects,
    });
  };

  const onUp = (ev: MouseEvent) => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    setDrag(null);
    if (!local.moved) {
      onPick(r);
      return;
    }
    const targetCol = columnRects.find(
      (c) => ev.clientX >= c.left && ev.clientX <= c.right
    );
    if (!targetCol) return;
    const target = computeDragTarget(r, local.dy);
    if (!target) return;
    const newStartIso = kstDateToUTCISO(anchorDate, target.h, target.m, 0);
    const newEndIso = new Date(
      new Date(newStartIso).getTime() + target.durationMs
    ).toISOString();
    const sameTime = newStartIso === r.starts_at && newEndIso === r.ends_at;
    const sameTrainer = targetCol.trainerId === r.trainer_member_id;
    if (sameTime && sameTrainer) return;
    void onReschedule(
      r.id,
      newStartIso,
      newEndIso,
      sameTrainer ? undefined : targetCol.trainerId
    );
  };

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

function DayDragGhost({ drag }: { drag: NonNullable<DayDragState> }) {
  const target = computeDragTarget(
    { starts_at: drag.origStartsAt, ends_at: drag.origEndsAt },
    drag.dy
  );
  const targetCol = drag.columnRects.find(
    (c) => drag.startX + drag.dx >= c.left && drag.startX + drag.dx <= c.right
  );
  const timeLabel = target
    ? `${String(target.h).padStart(2, "0")}:${String(target.m).padStart(2, "0")}`
    : "";
  const ok = Boolean(target && targetCol);
  return (
    <div
      className={`fixed z-50 pointer-events-none px-2 py-1 rounded-md text-[11.5px] font-semibold shadow-lg ${
        ok ? "bg-[#6B7B3A] text-white" : "bg-red-500 text-white"
      }`}
      style={{
        left: drag.startX + drag.dx + 12,
        top: drag.startY + drag.dy + 12,
      }}
    >
      {ok ? `${targetCol!.trainerName} ${timeLabel}` : "이동 불가"}
    </div>
  );
}

/* ─── Week View (7일 × 시간 그리드) ────────────────────────────── */

type WeekDragState = {
  id: number;
  origStartsAt: string;
  origEndsAt: string;
  origDayKey: string;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  moved: boolean;
  /** startDrag 시점의 컬럼 위치 스냅샷 (getBoundingClientRect 결과) */
  columnRects: { dayKey: string; left: number; right: number }[];
} | null;


function WeekView({
  anchor,
  reservations,
  events,
  trainers,
  onPick,
  onSlotClick,
  onReschedule,
}: {
  anchor: string;
  reservations: Reservation[];
  events: ScheduleEvent[];
  trainers: StaffOption[];
  onPick: (r: Reservation) => void;
  onSlotClick: (ymd: string, h: number, m: number, trainer: StaffOption | null) => void;
  onReschedule: (id: number, startsAt: string, endsAt: string, trainerMemberId?: number) => Promise<void> | void;
}) {
  void anchor;
  const columnRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const [drag, setDrag] = useState<WeekDragState>(null);

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
          {days.map((d, i) => {
            const today = isToday(d);
            return (
              <div
                key={i}
                className={`px-3 py-2 text-[12.5px] font-semibold border-l border-[#E8E0D0]/70 dark:border-zinc-800
                  ${today
                    ? "bg-[#6B7B3A]/12 dark:bg-[#6B7B3A]/25 text-[#6B7B3A] dark:text-[#A8B87A]"
                    : "text-[#2A251D] dark:text-zinc-100"
                  }`}
              >
                <div className="flex items-center gap-1.5">
                  {["일", "월", "화", "수", "목", "금", "토"][d.getDay()]}
                  {today && (
                    <span className="px-1 py-0.5 rounded text-[9.5px] font-bold bg-[#6B7B3A] text-white leading-none">
                      TODAY
                    </span>
                  )}
                </div>
                <div className={`text-[11px] font-normal ${today ? "text-[#6B7B3A] dark:text-[#A8B87A]" : "text-[#A89B80]"}`}>
                  {d.getMonth() + 1}/{d.getDate()}
                </div>
              </div>
            );
          })}
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
            const evList = events.filter((e) => kstDateKey(e.starts_at) === key);
            const defaultTrainer = trainers[0] ?? null;
            const now = nowKst();
            const isTodayCol = now.ymd === key;
            const nowMin = now.minutes - WORK_START_HOUR * 60;
            const showNowLine =
              isTodayCol && nowMin >= 0 && nowMin <= (WORK_END_HOUR - WORK_START_HOUR) * 60;
            const nowTop = (nowMin / SLOT_MINUTES) * SLOT_HEIGHT_PX;
            return (
              <div
                key={di}
                ref={(el) => {
                  columnRefs.current.set(key, el);
                }}
                data-day-key={key}
                className={`relative border-l border-[#E8E0D0]/70 dark:border-zinc-800 ${isTodayCol ? "bg-[#6B7B3A]/5" : ""}`}
              >
                {slots.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onSlotClick(key, s.h, s.m, defaultTrainer)}
                    title={`${key} ${s.label} 예약 만들기`}
                    className="w-full block border-b border-[#E8E0D0]/30 dark:border-zinc-800/30 hover:bg-[#6B7B3A]/5 cursor-pointer"
                    style={{ height: `${SLOT_HEIGHT_PX}px` }}
                  />
                ))}
                {showNowLine && (
                  <div
                    className="absolute left-0 right-0 z-20 pointer-events-none"
                    style={{ top: `${nowTop}px` }}
                  >
                    <div className="relative h-0.5 bg-[#4A8BE3] shadow-[0_0_4px_rgba(74,139,227,0.6)]">
                      <span className="absolute -top-1.5 -left-1 w-3 h-3 rounded-full bg-[#4A8BE3] shadow-md" />
                    </div>
                  </div>
                )}
                {evList.map((e) => {
                  const top = offsetPx(e.starts_at);
                  const bottom = offsetPx(e.ends_at);
                  const height = Math.max(SLOT_HEIGHT_PX * 0.9, bottom - top);
                  const cls =
                    e.type === "center"
                      ? "bg-[#5A8BB0]/15 text-[#487596] border-[#5A8BB0]/40"
                      : "bg-[#8B6BAA]/15 text-[#7A5C99] border-[#8B6BAA]/40";
                  return (
                    <div
                      key={`ev-${e.id}`}
                      className={`absolute left-1 right-1 px-1.5 py-0.5 rounded text-left text-[11px] font-medium border ${cls}`}
                      style={{ top: `${top}px`, height: `${height}px` }}
                      title={e.description ?? undefined}
                    >
                      <div className="truncate font-semibold">
                        {e.type === "center" ? "센터·" : "개인·"}
                        {e.title}
                      </div>
                    </div>
                  );
                })}
                {list.map((r) => {
                  const top = offsetPx(r.starts_at);
                  const bottom = offsetPx(r.ends_at);
                  const height = Math.max(SLOT_HEIGHT_PX * 0.9, bottom - top);
                  const color = RESERVATION_STATUS_COLOR[r.status] ?? RESERVATION_STATUS_COLOR.booked;
                  const isDragging = drag?.id === r.id && drag.moved;
                  return (
                    <button
                      key={r.id}
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        e.preventDefault();
                        startWeekDrag(
                          e,
                          r,
                          columnRefs.current,
                          onPick,
                          onReschedule,
                          setDrag
                        );
                      }}
                      className={`absolute left-1 right-1 px-1.5 py-0.5 rounded text-left text-[11px] font-medium border ${color.bg} ${color.text} cursor-grab active:cursor-grabbing ${isDragging ? "opacity-40" : ""}`}
                      style={{ top: `${top}px`, height: `${height}px` }}
                    >
                      <div className="truncate font-semibold pointer-events-none">{r.member_name || "회원"}</div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      {drag && drag.moved && (
        <WeekDragGhost drag={drag} />
      )}
    </div>
  );
}

/**
 * WeekView 드래그 시작 핸들러.
 * mouseDown 시점의 컬럼 위치를 스냅샷 → mouseMove/Up 리스너 등록 (document 레벨).
 * 이동 거리 4px 이하면 클릭으로 간주 → onPick. 이상이면 스냅 후 onReschedule.
 */
function startWeekDrag(
  e: React.MouseEvent,
  r: Reservation,
  columns: Map<string, HTMLDivElement | null>,
  onPick: (r: Reservation) => void,
  onReschedule: (id: number, startsAt: string, endsAt: string, trainerMemberId?: number) => Promise<void> | void,
  setDrag: (s: WeekDragState) => void
) {
  const startX = e.clientX;
  const startY = e.clientY;
  const columnRects: { dayKey: string; left: number; right: number }[] = [];
  columns.forEach((el, dayKey) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    columnRects.push({ dayKey, left: rect.left, right: rect.right });
  });
  const origDayKey = kstDateKey(r.starts_at);
  const local = { dx: 0, dy: 0, moved: false };

  setDrag({
    id: r.id,
    origStartsAt: r.starts_at,
    origEndsAt: r.ends_at,
    origDayKey,
    startX,
    startY,
    dx: 0,
    dy: 0,
    moved: false,
    columnRects,
  });

  const onMove = (ev: MouseEvent) => {
    local.dx = ev.clientX - startX;
    local.dy = ev.clientY - startY;
    local.moved = local.moved || Math.hypot(local.dx, local.dy) > 4;
    setDrag({
      id: r.id,
      origStartsAt: r.starts_at,
      origEndsAt: r.ends_at,
      origDayKey,
      startX,
      startY,
      dx: local.dx,
      dy: local.dy,
      moved: local.moved,
      columnRects,
    });
  };

  const onUp = (ev: MouseEvent) => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    setDrag(null);
    if (!local.moved) {
      onPick(r);
      return;
    }
    const targetCol = columnRects.find(
      (c) => ev.clientX >= c.left && ev.clientX <= c.right
    );
    if (!targetCol) return;
    const target = computeDragTarget(r, local.dy);
    if (!target) return;
    const newStartIso = kstDateToUTCISO(targetCol.dayKey, target.h, target.m, 0);
    const newEndIso = new Date(
      new Date(newStartIso).getTime() + target.durationMs
    ).toISOString();
    if (newStartIso === r.starts_at && newEndIso === r.ends_at) return;
    void onReschedule(r.id, newStartIso, newEndIso);
  };

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

/**
 * 세로 delta(px) 를 30분 단위로 스냅해서 새 시각을 계산.
 * WORK_START_HOUR ~ WORK_END_HOUR 안으로 clamp.
 */
function computeDragTarget(
  r: { starts_at: string; ends_at: string },
  deltaY: number
): { h: number; m: number; durationMs: number } | null {
  const durationMs = new Date(r.ends_at).getTime() - new Date(r.starts_at).getTime();
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  const { h: oh, m: om } = kstParts(r.starts_at);
  const deltaSlots = Math.round(deltaY / SLOT_HEIGHT_PX);
  const deltaMin = deltaSlots * SLOT_MINUTES;
  let newMin = oh * 60 + om + deltaMin;
  const durationMin = durationMs / 60000;
  const minAllowed = WORK_START_HOUR * 60;
  const maxAllowed = WORK_END_HOUR * 60 - durationMin;
  if (maxAllowed < minAllowed) return null;
  newMin = Math.max(minAllowed, Math.min(maxAllowed, newMin));
  const h = Math.floor(newMin / 60);
  const m = newMin % 60;
  return { h, m, durationMs };
}

/**
 * 드래그 중 커서 근처에 "이동 후 시각" 라벨을 fixed 로 띄운다.
 */
function WeekDragGhost({ drag }: { drag: NonNullable<WeekDragState> }) {
  const target = computeDragTarget(
    { starts_at: drag.origStartsAt, ends_at: drag.origEndsAt },
    drag.dy
  );
  const targetCol = drag.columnRects.find(
    (c) => drag.startX + drag.dx >= c.left && drag.startX + drag.dx <= c.right
  );
  const label = target
    ? `${String(target.h).padStart(2, "0")}:${String(target.m).padStart(2, "0")}`
    : "";
  const dayLabel = targetCol ? targetCol.dayKey.slice(5).replace("-", "/") : "";
  const ok = Boolean(target && targetCol);
  return (
    <div
      className={`fixed z-50 pointer-events-none px-2 py-1 rounded-md text-[11.5px] font-semibold shadow-lg ${
        ok ? "bg-[#6B7B3A] text-white" : "bg-red-500 text-white"
      }`}
      style={{
        left: drag.startX + drag.dx + 12,
        top: drag.startY + drag.dy + 12,
      }}
    >
      {ok ? `${dayLabel} ${label}` : "이동 불가"}
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

/** KST 기준 날짜/시분 → UTC ISO 문자열 (m/h 오버플로우 허용, 예: m=90 → 다음 시각) */
function kstDateToUTCISO(ymd: string, h: number, m: number, s = 0): string {
  const kstMidnight = new Date(`${ymd}T00:00:00+09:00`);
  return new Date(
    kstMidnight.getTime() + h * 3600_000 + m * 60_000 + s * 1000
  ).toISOString();
}

function fmtKstHm(iso: string): string {
  const { h, m } = kstParts(iso);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "2026년07월09일까지 (5일 남음)" 형태로 포맷. 무기한/만료 상태도 처리. */
function formatExpiry(ymd: string): { text: string; tone: "normal" | "warn" | "expired" | "infinite" } {
  if (!ymd) return { text: "-", tone: "normal" };
  if (ymd === "9999-12-31") return { text: "무기한", tone: "infinite" };
  const [, m, d] = ymd.split("-").map(Number);
  const dateStr = `${String(m).padStart(2, "0")}월${String(d).padStart(2, "0")}일까지`;
  const target = new Date(`${ymd}T00:00:00+09:00`);
  const now = new Date();
  const nowKstMidnight = new Date(now.getTime() + 9 * 3600_000);
  nowKstMidnight.setUTCHours(0, 0, 0, 0);
  const kstNow = new Date(nowKstMidnight.getTime() - 9 * 3600_000);
  const diffDays = Math.round((target.getTime() - kstNow.getTime()) / (24 * 3600_000));
  if (diffDays < 0) return { text: `${dateStr} (만료됨)`, tone: "expired" };
  if (diffDays === 0) return { text: `${dateStr} (오늘 만료)`, tone: "warn" };
  const tone = diffDays <= 7 ? "warn" : "normal";
  return { text: `${dateStr} (${diffDays}일 남음)`, tone };
}

/* ─── 새 예약 모달 ────────────────────────────── */

function NewReservationModal({
  slot,
  trainers,
  onChangeTrainer,
  onClose,
  onCreated,
}: {
  slot: {
    trainerId: number;
    trainerName: string;
    startsAt: string;
    endsAt: string;
  };
  trainers: StaffOption[];
  onChangeTrainer: (t: StaffOption) => void;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { getIdToken } = useAuth();
  const [duration, setDuration] = useState(50);
  const [eventType, setEventType] = useState<"lesson" | "center" | "personal">("lesson");
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");

  // 담당 강사의 유효 수강권을 회원별로 묶은 목록
  interface AssignedPass {
    id: number;
    lesson_kind: string;
    remaining_sessions: number;
    total_sessions: number;
    session_minutes: number;
    trainer_member_id: number;
    status: string;
    expires_at: string;
    member_id: number;
    member_name: string;
  }
  const [assigned, setAssigned] = useState<AssignedPass[]>([]);
  const [loadingAssigned, setLoadingAssigned] = useState(false);

  // 이 강사에게 배정된 회원 이외를 찾을 때 검색
  const [filterText, setFilterText] = useState("");
  const [searchMode, setSearchMode] = useState<"assigned" | "search">("assigned");
  const [otherResults, setOtherResults] = useState<
    { id: number; name: string; phone: string | null }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [loadingOtherPasses, setLoadingOtherPasses] = useState(false);
  const [otherPasses, setOtherPasses] = useState<AssignedPass[]>([]);

  const [picked, setPicked] = useState<{ id: number; name: string; phone: string | null } | null>(
    null
  );
  const [passId, setPassId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // ESC 로 닫기
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const startsAt = slot.startsAt;
  const endsAt = useMemo(() => {
    const s = new Date(startsAt);
    s.setMinutes(s.getMinutes() + duration);
    return s.toISOString();
  }, [startsAt, duration]);

  // 강사 변경 시 담당 회원 수강권 자동 로드
  useEffect(() => {
    setPicked(null);
    setPassId(null);
    setOtherResults([]);
    setOtherPasses([]);
    setSearchMode("assigned");
    setFilterText("");
    (async () => {
      setLoadingAssigned(true);
      setError("");
      try {
        const token = await getIdToken();
        if (!token) return;
        const res = await fetch(
          `/api/crm/passes?trainer_id=${slot.trainerId}&status=valid&limit=500`,
          { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "조회 실패");
        setAssigned(
          (data.passes ?? []).filter(
            (p: { remaining_sessions: number }) => p.remaining_sessions > 0
          )
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "네트워크 오류");
      } finally {
        setLoadingAssigned(false);
      }
    })();
  }, [slot.trainerId, getIdToken]);

  const searchOther = async () => {
    const q = filterText.trim();
    if (!q) return;
    setError("");
    setSearching(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/members?q=${encodeURIComponent(q)}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "검색 실패");
      setOtherResults(data.members ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSearching(false);
    }
  };

  const loadPassesForMember = async (memberId: number) => {
    setError("");
    setLoadingOtherPasses(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/members/${memberId}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      const active: AssignedPass[] = (data.passes ?? [])
        .filter(
          (p: { status: string; remaining_sessions: number }) =>
            p.status === "valid" && p.remaining_sessions > 0
        )
        .map((p: AssignedPass) => ({
          ...p,
          member_id: memberId,
          member_name: data.member?.name ?? "",
        }));
      setOtherPasses(active);
      if (active[0]) {
        setPassId(active[0].id);
        if (active[0].session_minutes) setDuration(active[0].session_minutes);
      } else {
        setPassId(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoadingOtherPasses(false);
    }
  };

  const pickAssignedPass = (p: AssignedPass) => {
    setPicked({ id: p.member_id, name: p.member_name, phone: null });
    setPassId(p.id);
    if (p.session_minutes) setDuration(p.session_minutes);
  };

  const pickOtherMember = (m: { id: number; name: string; phone: string | null }) => {
    setPicked(m);
    setOtherResults([]);
    loadPassesForMember(m.id);
  };

  // 필터링된 담당 목록
  const filteredAssigned = (() => {
    if (!filterText.trim()) return assigned;
    const q = filterText.trim().toLowerCase();
    return assigned.filter(
      (p) =>
        p.member_name.toLowerCase().includes(q) ||
        p.lesson_kind.toLowerCase().includes(q)
    );
  })();

  const submit = async () => {
    setError("");
    if (eventType === "lesson") {
      if (!picked) return setError("회원을 선택해 주세요");
      if (!passId) return setError("사용할 수강권을 선택해 주세요");
    } else {
      if (!eventTitle.trim()) return setError("제목을 입력해 주세요");
    }
    setSubmitting(true);
    try {
      const token = await getIdToken();
      let res: Response;
      if (eventType === "lesson") {
        res = await fetch("/api/crm/reservations", {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({
            pass_id: passId,
            starts_at: startsAt,
            ends_at: endsAt,
          }),
        });
      } else {
        res = await fetch("/api/crm/schedule-events", {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({
            type: eventType, // center | personal
            title: eventTitle.trim(),
            description: eventDescription.trim() || undefined,
            trainer_member_id: eventType === "personal" ? slot.trainerId : undefined,
            starts_at: startsAt,
            ends_at: endsAt,
          }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md max-h-[88vh] flex flex-col rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-950 shadow-xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E8E0D0]/70 dark:border-zinc-800">
          <h2 className="text-[15px] font-semibold text-[#2A251D] dark:text-zinc-100">
            새 예약
          </h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="p-1 -m-1 text-[#A89B80] hover:text-[#3A342A]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div className="px-3 py-2.5 rounded-lg bg-[#FBF7EB] dark:bg-zinc-900/60 border border-[#E8E0D0]/70 dark:border-zinc-800 text-[12.5px] text-[#6B5D47] dark:text-zinc-400 space-y-1.5">
            <label className="flex items-center gap-2">
              <span className="shrink-0">강사:</span>
              <select
                value={slot.trainerId}
                onChange={(e) => {
                  const t = trainers.find((x) => x.id === Number(e.target.value));
                  if (t) onChangeTrainer(t);
                }}
                className="flex-1 px-2 py-1 rounded border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px] text-[#2A251D] dark:text-zinc-100"
              >
                {trainers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.display_name}
                  </option>
                ))}
              </select>
            </label>
            <div>
              시간:{" "}
              <strong className="text-[#2A251D] dark:text-zinc-100">
                {fmtKstHm(startsAt)} ~ {fmtKstHm(endsAt)}
              </strong>{" "}
              ({duration}분)
            </div>
          </div>

          {/* 유형 선택 */}
          <div className="inline-flex w-full rounded-lg border border-[#E8E0D0] dark:border-zinc-700 overflow-hidden">
            {(
              [
                { key: "lesson", label: "수업" },
                { key: "center", label: "센터일정" },
                { key: "personal", label: "개인일정" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setEventType(opt.key)}
                className={`flex-1 px-3 py-2 text-[13px] font-medium
                  ${eventType === opt.key
                    ? "bg-[#6B7B3A] text-white"
                    : "bg-[#FEFCF7] dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5]"
                  }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* 수업 길이 */}
          <div>
            <div className="text-[12.5px] font-medium text-[#6B5D47] dark:text-zinc-400 mb-1.5">
              수업 시간(분)
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {[30, 45, 50, 60, 75, 90].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setDuration(n)}
                  className={`px-2.5 py-1 rounded-full text-[12px] font-medium border
                    ${duration === n
                      ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
                      : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300"
                    }`}
                >
                  {n}분
                </button>
              ))}
              <div className="inline-flex items-center gap-1 ml-1">
                <input
                  type="number"
                  min={5}
                  max={480}
                  value={duration}
                  onChange={(e) =>
                    setDuration(Math.max(5, Math.min(480, Number(e.target.value) || 0)))
                  }
                  className="w-16 px-2 py-1 rounded-full text-[12px] border border-[#B47B2A] text-[#B47B2A] dark:border-amber-300 dark:text-amber-300 bg-white dark:bg-zinc-900 text-center focus:outline-none"
                  aria-label="수업 시간 직접 입력 (분)"
                />
                <span className="text-[11.5px] text-[#A89B80]">직접</span>
              </div>
            </div>
          </div>

          {/* 이벤트(센터/개인) 제목·설명 입력 */}
          {eventType !== "lesson" && (
            <>
              <div>
                <div className="text-[12.5px] font-medium text-[#6B5D47] dark:text-zinc-400 mb-1.5">
                  {eventType === "center" ? "센터 일정 제목" : "개인 일정 제목"}{" "}
                  <span className="text-[#B47B2A]">*</span>
                </div>
                <input
                  type="text"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value.slice(0, 60))}
                  placeholder={
                    eventType === "center"
                      ? "예: 전체 청소, 회식"
                      : "예: 병원 진료, 개인 운동"
                  }
                  maxLength={60}
                  className="w-full px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[13.5px]"
                />
              </div>
              <div>
                <div className="text-[12.5px] font-medium text-[#6B5D47] dark:text-zinc-400 mb-1.5">
                  상세 내용
                </div>
                <textarea
                  value={eventDescription}
                  onChange={(e) => setEventDescription(e.target.value.slice(0, 500))}
                  placeholder="스케줄에 대한 자세한 내용을 적어 주세요."
                  maxLength={500}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[13px] resize-none"
                />
              </div>
            </>
          )}

          {/* 회원 / 수강권 선택 (수업 유형만) */}
          {eventType === "lesson" && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[12.5px] font-medium text-[#6B5D47] dark:text-zinc-400">
                {searchMode === "assigned"
                  ? `${slot.trainerName} 담당 회원`
                  : "다른 회원 검색"}{" "}
                <span className="text-[#B47B2A]">*</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearchMode(searchMode === "assigned" ? "search" : "assigned");
                  setPicked(null);
                  setPassId(null);
                  setOtherResults([]);
                  setOtherPasses([]);
                }}
                className="text-[11.5px] text-[#6B7B3A] dark:text-[#A8B87A] hover:underline"
              >
                {searchMode === "assigned" ? "다른 회원 검색" : "담당 회원으로 돌아가기"}
              </button>
            </div>

            {searchMode === "assigned" ? (
              <>
                <input
                  type="text"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="이름 · 수업 종류로 필터"
                  className="mb-2 w-full px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[13px]"
                />
                {loadingAssigned ? (
                  <div className="px-3 py-4 text-center text-[12.5px] text-[#8C8270]">불러오는 중…</div>
                ) : filteredAssigned.length === 0 ? (
                  <div className="px-3 py-4 text-center text-[12.5px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-lg">
                    {assigned.length === 0
                      ? `${slot.trainerName} 담당 유효 수강권이 없어요.`
                      : "일치하는 결과가 없어요."}
                  </div>
                ) : (
                  <ul className="space-y-1.5 max-h-[260px] overflow-y-auto">
                    {filteredAssigned.map((p) => {
                      const selected = passId === p.id;
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => pickAssignedPass(p)}
                            className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors
                              ${selected
                                ? "border-[#6B7B3A] bg-[#6B7B3A]/10"
                                : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 hover:border-[#6B7B3A]/40"
                              }`}
                          >
                            {(() => {
                              const exp = formatExpiry(p.expires_at);
                              const expCls =
                                exp.tone === "expired"
                                  ? "text-red-600"
                                  : exp.tone === "warn"
                                    ? "text-[#B47B2A] dark:text-amber-300"
                                    : exp.tone === "infinite"
                                      ? "text-[#6B7B3A] dark:text-[#A8B87A]"
                                      : "text-[#8C8270] dark:text-zinc-500";
                              return (
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 space-y-0.5">
                                    <div className="text-[13.5px] font-semibold text-[#2A251D] dark:text-zinc-100 truncate">
                                      {p.member_name || "(이름 없음)"}
                                    </div>
                                    <div className="text-[11.5px] text-[#6B5D47] dark:text-zinc-400 truncate">
                                      {p.lesson_kind} · {p.session_minutes}분
                                    </div>
                                  </div>
                                  <div className="shrink-0 text-right space-y-0.5 leading-tight">
                                    <div className="text-[10.5px] text-[#A89B80] dark:text-zinc-500">
                                      총 {p.total_sessions}회 중
                                    </div>
                                    <div className="text-[11px] font-medium text-[#B47B2A] dark:text-amber-300">
                                      잔여 {p.remaining_sessions}회
                                    </div>
                                    <div className={`text-[10.5px] ${expCls}`}>{exp.text}</div>
                                  </div>
                                </div>
                              );
                            })()}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            ) : (
              <>
                {picked ? (
                  <>
                    <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-[#6B7B3A]/40 bg-[#6B7B3A]/5 mb-2">
                      <span className="text-[13.5px] text-[#3A342A] dark:text-zinc-200">
                        <strong>{picked.name}</strong>
                        {picked.phone && (
                          <span className="ml-2 text-[12px] text-[#8C8270]">{picked.phone}</span>
                        )}
                      </span>
                      <button
                        onClick={() => {
                          setPicked(null);
                          setOtherPasses([]);
                          setPassId(null);
                        }}
                        className="text-[12px] text-[#6B7B3A] hover:underline"
                      >
                        다시 선택
                      </button>
                    </div>
                    <div className="text-[12.5px] font-medium text-[#6B5D47] dark:text-zinc-400 mb-1.5">
                      사용할 수강권
                    </div>
                    {loadingOtherPasses ? (
                      <div className="text-[12.5px] text-[#8C8270]">불러오는 중…</div>
                    ) : otherPasses.length === 0 ? (
                      <div className="px-3 py-2.5 rounded-lg border border-dashed border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB]/40 text-[12.5px] text-[#8C8270]">
                        잔여가 있는 유효 수강권이 없어요.
                      </div>
                    ) : (
                      <ul className="space-y-1.5">
                        {otherPasses.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setPassId(p.id);
                                if (p.session_minutes) setDuration(p.session_minutes);
                              }}
                              className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors
                                ${passId === p.id
                                  ? "border-[#6B7B3A] bg-[#6B7B3A]/10"
                                  : "border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 hover:border-[#6B7B3A]/40"
                                }`}
                            >
                              <div className="text-[13px] font-semibold text-[#2A251D] dark:text-zinc-100">
                                {p.lesson_kind}
                              </div>
                              <div className="mt-0.5 flex items-end justify-between gap-2">
                                <span className="text-[11.5px] text-[#6B5D47] dark:text-zinc-400 truncate">
                                  잔여 {p.remaining_sessions}/{p.total_sessions}회 · {p.session_minutes}분
                                  {p.trainer_member_id !== slot.trainerId && (
                                    <span className="ml-2 text-[#B47B2A]">다른 강사 수강권</span>
                                  )}
                                </span>
                                {(() => {
                                  const exp = formatExpiry(p.expires_at);
                                  const cls =
                                    exp.tone === "expired"
                                      ? "text-red-600"
                                      : exp.tone === "warn"
                                        ? "text-[#B47B2A] dark:text-amber-300"
                                        : exp.tone === "infinite"
                                          ? "text-[#6B7B3A] dark:text-[#A8B87A]"
                                          : "text-[#8C8270] dark:text-zinc-500";
                                  return (
                                    <span
                                      className={`shrink-0 text-right text-[10.5px] leading-tight ${cls}`}
                                    >
                                      {exp.text}
                                    </span>
                                  );
                                })()}
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <input
                        className="flex-1 px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[13.5px]"
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            searchOther();
                          }
                        }}
                        placeholder="이름 또는 연락처"
                      />
                      <button
                        onClick={searchOther}
                        disabled={searching || !filterText.trim()}
                        className="px-4 rounded-lg bg-[#6B7B3A] disabled:opacity-60 text-white text-[13px] font-semibold hover:bg-[#5a6932]"
                      >
                        {searching ? "…" : "검색"}
                      </button>
                    </div>
                    {otherResults.length > 0 && (
                      <ul className="mt-2 space-y-1.5 max-h-[180px] overflow-y-auto">
                        {otherResults.map((m) => (
                          <li key={m.id}>
                            <button
                              onClick={() => pickOtherMember(m)}
                              className="w-full text-left px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 hover:border-[#6B7B3A]/50"
                            >
                              <div className="text-[13px] font-medium text-[#2A251D] dark:text-zinc-100">
                                {m.name}
                              </div>
                              {m.phone && (
                                <div className="text-[11.5px] text-[#A89B80]">{m.phone}</div>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </>
            )}
          </div>
          )}

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-2 px-5 py-3.5 border-t border-[#E8E0D0]/70 dark:border-zinc-800">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13.5px] font-semibold text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5]"
          >
            취소
          </button>
          <button
            onClick={submit}
            disabled={
              submitting ||
              (eventType === "lesson"
                ? !picked || !passId
                : !eventTitle.trim())
            }
            className="flex-1 px-4 py-2.5 rounded-lg bg-[#6B7B3A] disabled:opacity-50 text-white text-[13.5px] font-semibold hover:bg-[#5a6932]"
          >
            {submitting
              ? "저장 중…"
              : eventType === "lesson"
                ? "예약 만들기"
                : eventType === "center"
                  ? "센터 일정 등록"
                  : "개인 일정 등록"}
          </button>
        </div>
      </div>
    </div>
  );
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
