"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import {
  RESERVATION_STATUS_LABEL,
  RESERVATION_STATUS_COLOR,
  SCHEDULE_LEGEND,
} from "../_components/crm-labels";
import BookingRequestsPanel from "../_components/booking-requests-panel";

interface Reservation {
  id: number;
  pass_id: number;
  member_id: number;
  member_name: string;
  trainer_member_id: number;
  trainer_name?: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  consumed: boolean;
  attended_at: string | null;
  cancelled_reason: string | null;
  booking_reason?: string | null;
  session_index: number | null;
  session_total: number | null;
  created_by_uid?: string | null;
  created_by_name?: string | null;
  created_at?: string | null;
}

// "총 10회 중 3회째" → "3/10회" 짧은 배지
function sessionBadge(r: { session_index: number | null; session_total: number | null }): string | null {
  if (!r.session_index || !r.session_total) return null;
  return `${r.session_index}/${r.session_total}회`;
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

/**
 * 시간대가 겹치는 아이템들을 나란히 배치하기 위한 좌표(colIdx, colCount) 계산.
 * 서로 겹치는 아이템끼리 한 '클러스터'로 묶고, 클러스터 내 최대 동시 개수를 colCount 로 사용.
 * 렌더 시 width = 100/colCount %, left = (100/colCount)*colIdx %.
 */
function layoutOverlaps<
  T extends { id: number | string; starts_at: string; ends_at: string }
>(items: T[]): Map<T["id"], { colIdx: number; colCount: number }> {
  const result = new Map<T["id"], { colIdx: number; colCount: number }>();
  if (items.length === 0) return result;
  const sorted = [...items].sort((a, b) =>
    a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : 0
  );

  let cluster: T[] = [];
  let clusterEnd = "";
  const flush = () => {
    if (!cluster.length) return;
    // 클러스터 안에서 greedy 로 컬럼 배정: 각 컬럼의 마지막 종료시각 배열.
    const colEnds: string[] = [];
    const idxByItem = new Map<T["id"], number>();
    for (const it of cluster) {
      let col = 0;
      while (col < colEnds.length && colEnds[col] > it.starts_at) col++;
      colEnds[col] = it.ends_at;
      idxByItem.set(it.id, col);
    }
    const colCount = Math.max(1, colEnds.length);
    for (const it of cluster) {
      result.set(it.id, { colIdx: idxByItem.get(it.id) ?? 0, colCount });
    }
    cluster = [];
    clusterEnd = "";
  };

  for (const it of sorted) {
    if (cluster.length && it.starts_at >= clusterEnd) flush();
    cluster.push(it);
    if (it.ends_at > clusterEnd) clusterEnd = it.ends_at;
  }
  flush();
  return result;
}

export default function CrmSchedulePage() {
  const { getIdToken } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, 10));
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [role, setRole] = useState<"owner" | "admin" | "manager" | "trainer" | null>(null);
  const [myMemberId, setMyMemberId] = useState<number | null>(null);
  const [selectedTrainerId, setSelectedTrainerId] = useState<number | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Reservation | null>(null);
  const [editing, setEditing] = useState<Reservation | null>(null);
  const [pickedEvent, setPickedEvent] = useState<ScheduleEvent | null>(null);
  const [newSlot, setNewSlot] = useState<{
    trainerId: number;
    trainerName: string;
    startsAt: string;
    endsAt: string;
  } | null>(null);
  // 드래그 후 확인 대기 상태
  const [pendingReschedule, setPendingReschedule] = useState<{
    reservation: Reservation;
    newStartIso: string;
    newEndIso: string;
    newTrainerId?: number;
    newTrainerName?: string;
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
        if (typeof data?.centerMemberId === "number") setMyMemberId(data.centerMemberId);
      }
    })();
  }, [getIdToken]);

  const trainers = useMemo(
    () => staff.filter((s) => s.role === "trainer" || s.role === "manager" || s.role === "owner" || s.role === "admin"),
    [staff]
  );

  // 강사 필터가 특정인이면 그 강사만 컬럼으로 표시 (다른 컬럼에서 중복 표시되는 오해 방지).
  // '전체(all)' 이면 모든 강사 컬럼 표시.
  const visibleTrainers = useMemo(() => {
    if (selectedTrainerId === "all") return trainers;
    return trainers.filter((t) => t.id === selectedTrainerId);
  }, [trainers, selectedTrainerId]);

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

  // 드래그 종료 시 자식 뷰에서 호출 — 실제 변경 전 확인창을 띄운다
  const proposeReschedule = useCallback(
    (
      r: Reservation,
      newStartIso: string,
      newEndIso: string,
      newTrainerId?: number,
      newTrainerName?: string
    ) => {
      setPendingReschedule({
        reservation: r,
        newStartIso,
        newEndIso,
        newTrainerId,
        newTrainerName,
      });
    },
    []
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
      <BookingRequestsPanel onChanged={load} />
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

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="text-[13px] text-[#6B5D47] dark:text-zinc-400">
          {rangeLabel} · 예약 {reservations.length}건 · 일정 {events.length}건
        </span>
        {/* 상태 색상 범례 */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {SCHEDULE_LEGEND.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5 text-[12px] text-[#6B5D47] dark:text-zinc-400">
              <span className={`w-2.5 h-2.5 rounded-full ${RESERVATION_STATUS_COLOR[s.key]?.dot ?? "bg-zinc-400"}`} />
              {s.label}
            </span>
          ))}
        </div>
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
          trainers={visibleTrainers}
          reservations={reservations}
          events={events}
          anchorDate={anchor}
          onPick={setPicked}
          onPickEvent={setPickedEvent}
          onReschedule={proposeReschedule}
          strictTrainerId={selectedTrainerId === "all" ? null : selectedTrainerId}
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
          trainers={visibleTrainers}
          onPick={setPicked}
          onPickEvent={setPickedEvent}
          onReschedule={proposeReschedule}
          strictTrainerId={selectedTrainerId === "all" ? null : selectedTrainerId}
          onSlotClick={(ymd, h, m, defaultTrainer) => {
            // 강사 필터가 특정인이면 그 강사를 기본으로. 전체 모드일 때만 로그인 사용자 우선.
            const me =
              selectedTrainerId === "all" && myMemberId != null
                ? visibleTrainers.find((t) => t.id === myMemberId)
                : null;
            const chosen = me ?? defaultTrainer;
            if (!chosen) return;
            setNewSlot({
              trainerId: chosen.id,
              trainerName: chosen.display_name,
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
          trainers={visibleTrainers}
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
          onEdit={() => {
            setEditing(picked);
            setPicked(null);
          }}
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

      {editing && (
        <EditReservationModal
          reservation={editing}
          trainers={trainers}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      {pickedEvent && (
        <EventDialog
          event={pickedEvent}
          trainers={trainers}
          onClose={() => setPickedEvent(null)}
          onDelete={async () => {
            const ev = pickedEvent;
            const token = await getIdToken();
            const res = await fetch(`/api/crm/schedule-events/${ev.id}`, {
              method: "DELETE",
              headers: { authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
              const d = await res.json().catch(() => ({}));
              alert(d?.error || "삭제 실패");
              return;
            }
            setPickedEvent(null);
            load();
          }}
        />
      )}

      {pendingReschedule && (
        <RescheduleConfirmDialog
          pending={pendingReschedule}
          onCancel={() => setPendingReschedule(null)}
          onConfirm={async () => {
            const p = pendingReschedule;
            setPendingReschedule(null);
            await reschedule(
              p.reservation.id,
              p.newStartIso,
              p.newEndIso,
              p.newTrainerId
            );
          }}
        />
      )}
    </div>
  );
}

/** 예약 수정 다이얼로그 — 시간·강사 변경. 서버 PATCH reschedule 흐름 사용. */
function EditReservationModal({
  reservation,
  trainers,
  onClose,
  onSaved,
}: {
  reservation: Reservation;
  trainers: StaffOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { getIdToken } = useAuth();
  // 예약 시간을 로컬(KST) 값으로 변환해 편집 입력에 채움.
  const startKst = new Date(reservation.starts_at);
  const endKst = new Date(reservation.ends_at);
  const initDate = (() => {
    const kst = new Date(startKst.getTime() + 9 * 3600 * 1000);
    return kst.toISOString().slice(0, 10);
  })();
  const initTime = (() => {
    const kst = new Date(startKst.getTime() + 9 * 3600 * 1000);
    return kst.toISOString().slice(11, 16);
  })();
  const initDuration = Math.max(
    5,
    Math.round((endKst.getTime() - startKst.getTime()) / 60000)
  );

  const [trainerId, setTrainerId] = useState<number>(reservation.trainer_member_id);
  const [date, setDate] = useState<string>(initDate);
  const [time, setTime] = useState<string>(initTime);
  const [duration, setDuration] = useState<number>(initDuration);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // 이 수강권에 등록된 담당·추가강사 id 집합 (담당 강사 후보 제한용)
  const [allowedTrainerIds, setAllowedTrainerIds] = useState<Set<number> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!reservation.pass_id) {
        setAllowedTrainerIds(new Set([reservation.trainer_member_id]));
        return;
      }
      try {
        const token = await getIdToken();
        const res = await fetch(`/api/crm/passes/${reservation.pass_id}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled || !res.ok) return;
        const p = data.pass ?? {};
        const primary = Number(p.trainer_member_id) || 0;
        const co: number[] = Array.isArray(p.co_trainer_ids) ? p.co_trainer_ids : [];
        const ids = new Set<number>();
        if (primary) ids.add(primary);
        for (const c of co) if (Number(c)) ids.add(Number(c));
        // 현재 예약 담당도 후보에 유지 (기존 값을 지키기 위해)
        ids.add(reservation.trainer_member_id);
        setAllowedTrainerIds(ids);
      } catch {
        setAllowedTrainerIds(new Set([reservation.trainer_member_id]));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reservation.pass_id, reservation.trainer_member_id, getIdToken]);

  const submit = async () => {
    setError("");
    if (!date || !time) return setError("날짜와 시간을 입력해 주세요");
    const [hStr, mStr] = time.split(":");
    const h = Number(hStr);
    const m = Number(mStr);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return setError("시간 형식 오류");
    // KST → UTC ISO
    const startIso = new Date(`${date}T${time}:00+09:00`).toISOString();
    const endIso = new Date(
      new Date(startIso).getTime() + duration * 60 * 1000
    ).toISOString();

    setSaving(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/reservations/${reservation.id}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          starts_at: startIso,
          ends_at: endIso,
          trainer_member_id: trainerId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "수정 실패");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-950 shadow-xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E8E0D0]/70 dark:border-zinc-800">
          <h2 className="text-[15px] font-semibold text-[#2A251D] dark:text-zinc-100">
            예약 수정
          </h2>
          <button
            onClick={onClose}
            className="p-1 -m-1 text-[#A89B80] hover:text-[#3A342A]"
            aria-label="닫기"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div className="px-3 py-2.5 rounded-lg bg-[#FBF7EB] dark:bg-zinc-900/60 border border-[#E8E0D0]/70 dark:border-zinc-800 text-[12.5px] text-[#6B5D47] dark:text-zinc-400 space-y-1">
            <div>
              회원: <strong className="text-[#2A251D] dark:text-zinc-100">{reservation.member_name || "회원"}</strong>
              {sessionBadge(reservation) && (
                <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A]">
                  {sessionBadge(reservation)}
                </span>
              )}
            </div>
            <div className="text-[11.5px] text-[#A89B80]">
              회원·수강권은 여기서 바꿀 수 없어요. 다른 회원으로 옮기려면 예약을 취소하고 새로 만들어 주세요.
            </div>
          </div>

          <div>
            <div className="text-[12.5px] font-medium text-[#6B5D47] dark:text-zinc-400 mb-1.5">
              담당 강사
            </div>
            {(() => {
              // 이 수강권에 등록된 담당·추가강사만 후보. 아직 로딩 중이면 현재 담당만 표시.
              const list = allowedTrainerIds
                ? trainers.filter((t) => allowedTrainerIds.has(t.id))
                : trainers.filter((t) => t.id === trainerId);
              return (
                <select
                  value={trainerId}
                  onChange={(e) => setTrainerId(Number(e.target.value))}
                  disabled={!allowedTrainerIds}
                  className="w-full px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[13.5px] disabled:opacity-60"
                >
                  {list.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.display_name}
                      {t.role !== "trainer" && (
                        <> {" "}({t.role === "owner" ? "대표자" : t.role === "admin" ? "관리자" : "팀장"})</>
                      )}
                    </option>
                  ))}
                </select>
              );
            })()}
            <p className="mt-1 text-[11px] text-[#A89B80]">
              이 수강권에 등록된 담당 강사와 추가 강사만 선택할 수 있어요.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[12.5px] font-medium text-[#6B5D47] dark:text-zinc-400 mb-1.5">
                날짜
              </div>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[13.5px]"
              />
            </div>
            <div>
              <div className="text-[12.5px] font-medium text-[#6B5D47] dark:text-zinc-400 mb-1.5">
                시작 시간
              </div>
              <input
                type="time"
                step={300}
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[13.5px]"
              />
            </div>
          </div>

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
              <input
                type="number"
                min={5}
                max={480}
                value={duration}
                onChange={(e) =>
                  setDuration(Math.max(5, Math.min(480, Number(e.target.value) || 0)))
                }
                className="w-16 px-2 py-1 rounded-full text-[12px] border border-[#B47B2A] text-[#B47B2A] dark:border-amber-300 dark:text-amber-300 bg-white dark:bg-zinc-900 text-center focus:outline-none ml-1"
                aria-label="수업 시간 직접 입력 (분)"
              />
              <span className="text-[11.5px] text-[#A89B80]">직접</span>
            </div>
          </div>

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
            disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-lg bg-[#6B7B3A] disabled:opacity-50 text-white text-[13.5px] font-semibold hover:bg-[#5a6932]"
          >
            {saving ? "저장 중…" : "예약 수정"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 센터/개인 일정 상세 다이얼로그 (삭제 지원) */
function EventDialog({
  event,
  trainers,
  onClose,
  onDelete,
}: {
  event: ScheduleEvent;
  trainers: StaffOption[];
  onClose: () => void;
  onDelete: () => void;
}) {
  const trainerName = trainers.find((t) => t.id === event.trainer_member_id)?.display_name ?? null;
  const typeLabel = event.type === "center" ? "센터 일정" : "개인 일정";
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-950 shadow-xl p-5">
        <h2 className="text-[15px] font-semibold text-[#2A251D] dark:text-zinc-100">일정 상세</h2>
        <div className="mt-2 text-[13px] text-[#6B5D47] dark:text-zinc-400 space-y-1">
          <div>
            <span className="text-[11.5px] text-[#A89B80] mr-1.5">유형</span>
            <span className="font-medium text-[#3A342A] dark:text-zinc-200">{typeLabel}</span>
            {event.type === "personal" && trainerName && (
              <span className="ml-1.5 text-[12px] text-[#8C8270]">· {trainerName}</span>
            )}
          </div>
          <div>
            <span className="text-[11.5px] text-[#A89B80] mr-1.5">제목</span>
            <span className="font-semibold text-[#2A251D] dark:text-zinc-100">{event.title}</span>
          </div>
          <div className="text-[12px] text-[#8C8270]">
            {formatDateTimeKST(event.starts_at)} ~ {formatTimeKST(event.ends_at)}
          </div>
          {event.description && (
            <div className="mt-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-800 bg-[#F5F0E5]/60 dark:bg-zinc-900 px-2.5 py-2 whitespace-pre-wrap break-words text-[12.5px] text-[#3A342A] dark:text-zinc-200">
              {event.description}
            </div>
          )}
        </div>

        <div className="mt-4 space-y-2">
          {!confirming ? (
            <>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="w-full px-3 py-2 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-[13px] font-semibold text-red-700 dark:text-red-300 hover:bg-red-100"
              >
                일정 삭제
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13px] text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
              >
                닫기
              </button>
            </>
          ) : (
            <>
              <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[12.5px] text-red-700 dark:text-red-300">
                정말 삭제할까요? 되돌릴 수 없어요.
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13px] text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
                >
                  아니오
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  className="px-3 py-2 rounded-lg bg-red-600 text-white text-[13px] font-semibold hover:bg-red-700"
                >
                  삭제
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** 드래그 후 예약 변경 확인 다이얼로그 */
function RescheduleConfirmDialog({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: {
    reservation: Reservation;
    newStartIso: string;
    newEndIso: string;
    newTrainerId?: number;
    newTrainerName?: string;
  };
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { reservation, newStartIso, newEndIso, newTrainerName } = pending;
  const beforeDay = kstDateKey(reservation.starts_at);
  const afterDay = kstDateKey(newStartIso);
  const trainerChanged = Boolean(newTrainerName);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-950 shadow-xl p-5">
        <h2 className="text-[16px] font-bold text-[#2A251D] dark:text-zinc-100">
          예약 변경
        </h2>
        <p className="mt-1.5 text-[13px] text-[#6B5D47] dark:text-zinc-400">
          <span className="font-semibold text-[#3A342A] dark:text-zinc-200">
            {reservation.member_name || "회원"}
          </span>{" "}
          회원의 예약을 아래처럼 변경할까요?
        </p>
        <div className="mt-3 rounded-lg border border-[#E8E0D0] dark:border-zinc-800 divide-y divide-[#E8E0D0] dark:divide-zinc-800 text-[13px]">
          <div className="px-3 py-2 flex justify-between gap-3">
            <span className="text-[#8C8270] dark:text-zinc-500 shrink-0">변경 전</span>
            <span className="text-[#3A342A] dark:text-zinc-200 text-right">
              {beforeDay} {fmtKstHm(reservation.starts_at)}~{fmtKstHm(reservation.ends_at)}
            </span>
          </div>
          <div className="px-3 py-2 flex justify-between gap-3 bg-[#6B7B3A]/5">
            <span className="text-[#8C8270] dark:text-zinc-500 shrink-0">변경 후</span>
            <span className="text-[#6B7B3A] dark:text-[#A8B87A] font-semibold text-right">
              {afterDay} {fmtKstHm(newStartIso)}~{fmtKstHm(newEndIso)}
              {trainerChanged && (
                <div className="text-[11.5px] font-normal text-[#B47B2A]">
                  강사: {newTrainerName}
                </div>
              )}
            </span>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13.5px] font-semibold text-[#3A342A] dark:text-zinc-200 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-lg bg-[#6B7B3A] hover:bg-[#5a6932] text-white text-[13.5px] font-semibold"
          >
            변경
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Day View (강사 × 시간 그리드) ────────────────────────────── */

type DayDragState = {
  id: number;
  reservation: Reservation;
  origTrainerId: number;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  moved: boolean;
  anchorDate: string;
  columnRects: {
    trainerId: number;
    trainerName: string;
    left: number;
    right: number;
    top: number;
    width: number;
  }[];
} | null;

function DayView({
  trainers,
  reservations,
  events,
  anchorDate,
  onPick,
  onPickEvent,
  onSlotClick,
  onReschedule,
  strictTrainerId,
}: {
  trainers: StaffOption[];
  reservations: Reservation[];
  events: ScheduleEvent[];
  anchorDate: string;
  onPick: (r: Reservation) => void;
  onPickEvent: (e: ScheduleEvent) => void;
  onSlotClick: (trainer: StaffOption, h: number, m: number) => void;
  onReschedule: (
    r: Reservation,
    newStartIso: string,
    newEndIso: string,
    newTrainerId?: number,
    newTrainerName?: string
  ) => void;
  /** 특정 강사가 필터된 상태면 그 id. null 이면 전체(all). 필터된 상태에서는 다른 트레이너의 일정·센터 일정 제외. */
  strictTrainerId: number | null;
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

        {/* 하루 종일 노출되는 센터 일정 스트립 — 강사 컬럼과 무관하게 한 번만 표시 */}
        {(() => {
          const centerEvents = events.filter((e) => e.type === "center");
          if (centerEvents.length === 0) return null;
          return (
            <div className="border-b border-[#E8E0D0] dark:border-zinc-800 bg-[#5A8BB0]/8 dark:bg-[#5A8BB0]/12 px-3 py-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10.5px] font-semibold text-[#487596] dark:text-[#8FB7D4]">
                  센터 일정
                </span>
                {centerEvents.map((e) => (
                  <button
                    key={`center-${e.id}`}
                    type="button"
                    onClick={() => onPickEvent(e)}
                    className="px-2 py-0.5 rounded-md text-[11.5px] font-medium border border-[#5A8BB0]/40 bg-[#5A8BB0]/15 text-[#487596] dark:text-[#8FB7D4] hover:bg-[#5A8BB0]/25"
                    title={`${fmtKstHm(e.starts_at)} ~ ${fmtKstHm(e.ends_at)}${e.description ? " · " + e.description : ""}`}
                  >
                    <span className="font-semibold">{e.title}</span>
                    <span className="ml-1 text-[10.5px] opacity-80">
                      {fmtKstHm(e.starts_at)}~{fmtKstHm(e.ends_at)}
                    </span>
                  </button>
                ))}
              </div>
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
            // 예약은 항상 담당 강사(trainer_member_id) 기준으로 컬럼에 배치.
            // (owner 가 다른 강사 pass 로 대신 예약해준 경우도 담당 강사 컬럼에 표시)
            const list = reservations.filter(
              (r) => r.trainer_member_id === t.id && r.status !== "cancelled"
            );
            void strictTrainerId;
            // 센터 일정은 상단 스트립에서 한 번만 표시하고, 강사 컬럼에는 개인 일정만 배치.
            const evList = events.filter(
              (e) => e.type === "personal" && e.trainer_member_id === t.id
            );
            // 예약·개인일정 겹침을 가로 분할로 배치.
            type Lay = { id: string; starts_at: string; ends_at: string };
            const layInput: Lay[] = [
              ...list.map((r) => ({ id: `r-${r.id}`, starts_at: r.starts_at, ends_at: r.ends_at })),
              ...evList.map((e) => ({ id: `e-${e.id}`, starts_at: e.starts_at, ends_at: e.ends_at })),
            ];
            const layout = layoutOverlaps(layInput);
            const laneStyle = (id: string) => {
              const l = layout.get(id) ?? { colIdx: 0, colCount: 1 };
              const widthPct = 100 / l.colCount;
              const leftPct = widthPct * l.colIdx;
              // 아이템 사이 미세 간격
              return {
                left: `calc(${leftPct}% + 2px)`,
                width: `calc(${widthPct}% - 4px)`,
              } as React.CSSProperties;
            };
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
                    "bg-[#8B6BAA]/15 text-[#7A5C99] border-[#8B6BAA]/40 hover:bg-[#8B6BAA]/25";
                  return (
                    <button
                      type="button"
                      key={`ev-${e.id}`}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onPickEvent(e);
                      }}
                      className={`absolute px-2 py-1 rounded-md text-left text-[11.5px] font-medium border cursor-pointer ${cls}`}
                      style={{ top: `${top}px`, height: `${height}px`, ...laneStyle(`e-${e.id}`) }}
                      title={e.description ?? e.title}
                    >
                      <div className="truncate font-semibold">
                        [개인] {e.title}
                      </div>
                    </button>
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
                      className={`absolute px-2 py-1 rounded-md text-left text-[11.5px] font-medium border ${color.bg} ${color.text} cursor-grab active:cursor-grabbing ${isDragging ? "opacity-40" : ""}`}
                      style={{ top: `${top}px`, height: `${height}px`, ...laneStyle(`r-${r.id}`) }}
                    >
                      <div className="truncate font-semibold pointer-events-none">{r.member_name || "회원"}</div>
                      <div className="truncate text-[10.5px] opacity-80 pointer-events-none">
                        {RESERVATION_STATUS_LABEL[r.status]}
                        {sessionBadge(r) && <span className="ml-1 font-semibold">· {sessionBadge(r)}</span>}
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
  onReschedule: (
    r: Reservation,
    newStartIso: string,
    newEndIso: string,
    newTrainerId?: number,
    newTrainerName?: string
  ) => void,
  setDrag: (s: DayDragState) => void
) {
  const startX = e.clientX;
  const startY = e.clientY;
  const columnRects: {
    trainerId: number;
    trainerName: string;
    left: number;
    right: number;
    top: number;
    width: number;
  }[] = [];
  columns.forEach((el, trainerId) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const t = trainers.find((x) => x.id === trainerId);
    columnRects.push({
      trainerId,
      trainerName: t?.display_name ?? "",
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.width,
    });
  });
  const local = { dx: 0, dy: 0, moved: false };

  const base: DayDragState = {
    id: r.id,
    reservation: r,
    origTrainerId: r.trainer_member_id,
    startX,
    startY,
    dx: 0,
    dy: 0,
    moved: false,
    anchorDate,
    columnRects,
  };
  setDrag(base);

  const onMove = (ev: MouseEvent) => {
    local.dx = ev.clientX - startX;
    local.dy = ev.clientY - startY;
    local.moved = local.moved || Math.hypot(local.dx, local.dy) > 4;
    setDrag({
      ...base!,
      dx: local.dx,
      dy: local.dy,
      moved: local.moved,
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
    onReschedule(
      r,
      newStartIso,
      newEndIso,
      sameTrainer ? undefined : targetCol.trainerId,
      sameTrainer ? undefined : targetCol.trainerName
    );
  };

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

function DayDragGhost({ drag }: { drag: NonNullable<DayDragState> }) {
  const r = drag.reservation;
  const target = computeDragTarget(
    { starts_at: r.starts_at, ends_at: r.ends_at },
    drag.dy
  );
  const targetCol = drag.columnRects.find(
    (c) => drag.startX + drag.dx >= c.left && drag.startX + drag.dx <= c.right
  );
  const timeLabel = target
    ? `${String(target.h).padStart(2, "0")}:${String(target.m).padStart(2, "0")}`
    : "";
  const ok = Boolean(target && targetCol);
  const color =
    RESERVATION_STATUS_COLOR[r.status] ?? RESERVATION_STATUS_COLOR.booked;

  let cardStyle: React.CSSProperties | null = null;
  if (ok && targetCol && target) {
    const durationMin = target.durationMs / 60000;
    const cardHeight = Math.max(
      SLOT_HEIGHT_PX * 0.9,
      (durationMin / SLOT_MINUTES) * SLOT_HEIGHT_PX
    );
    const withinColMin = (target.h - WORK_START_HOUR) * 60 + target.m;
    const cardTop = targetCol.top + (withinColMin / SLOT_MINUTES) * SLOT_HEIGHT_PX;
    cardStyle = {
      left: targetCol.left + 4,
      top: cardTop,
      width: targetCol.width - 8,
      height: cardHeight,
    };
  }

  return (
    <>
      {cardStyle && (
        <div
          className={`fixed z-40 pointer-events-none px-2 py-1 rounded-md border-2 border-dashed text-left text-[11.5px] font-medium shadow-md ${color.bg} ${color.text} opacity-60 transition-[top,left,width] duration-75 ease-out`}
          style={cardStyle}
        >
          <div className="truncate font-semibold">
            {r.member_name || "회원"}
          </div>
          <div className="truncate text-[10.5px] opacity-80">
            {RESERVATION_STATUS_LABEL[r.status]}
            {sessionBadge(r) && <span className="ml-1 font-semibold">· {sessionBadge(r)}</span>}
          </div>
        </div>
      )}
      <div
        className={`fixed z-50 pointer-events-none px-2 py-1 rounded-md text-[11.5px] font-semibold shadow-lg ${
          ok ? "bg-[#6B7B3A] text-white" : "bg-red-500 text-white"
        }`}
        style={{
          left: drag.startX + drag.dx + 14,
          top: drag.startY + drag.dy + 14,
        }}
      >
        {ok ? `${targetCol!.trainerName} ${timeLabel}` : "이동 불가"}
      </div>
    </>
  );
}

/* ─── Week View (7일 × 시간 그리드) ────────────────────────────── */

type WeekDragState = {
  id: number;
  reservation: Reservation;
  origDayKey: string;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  moved: boolean;
  /** startDrag 시점의 컬럼 위치 스냅샷 (getBoundingClientRect 결과) */
  columnRects: { dayKey: string; left: number; right: number; top: number; width: number }[];
} | null;


function WeekView({
  anchor,
  reservations,
  events,
  trainers,
  onPick,
  onPickEvent,
  onSlotClick,
  onReschedule,
  strictTrainerId,
}: {
  anchor: string;
  reservations: Reservation[];
  events: ScheduleEvent[];
  trainers: StaffOption[];
  onPick: (r: Reservation) => void;
  onPickEvent: (e: ScheduleEvent) => void;
  onSlotClick: (ymd: string, h: number, m: number, trainer: StaffOption | null) => void;
  onReschedule: (
    r: Reservation,
    newStartIso: string,
    newEndIso: string,
    newTrainerId?: number,
    newTrainerName?: string
  ) => void;
  /** 특정 강사가 필터된 상태면 그 id. null 이면 전체(all). 필터된 상태에서는 다른 트레이너의 일정·센터 일정 제외. */
  strictTrainerId: number | null;
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
            // 특정 강사 필터 시엔 서버가 이미 필터함. 클라이언트는 날짜만 매칭.
            const list = reservations.filter(
              (r) => kstDateKey(r.starts_at) === key && r.status !== "cancelled"
            );
            void strictTrainerId;
            // 서버가 trainer_id 로 이미 필터함. 클라이언트는 날짜 매칭만.
            const evList = events.filter((e) => kstDateKey(e.starts_at) === key);
            // 겹치는 아이템들을 나란히 배치하기 위한 좌표. 예약(res-N) + 이벤트(ev-N) 통합 계산.
            type Lay = { id: string; starts_at: string; ends_at: string };
            const layInput: Lay[] = [
              ...list.map((r) => ({ id: `r-${r.id}`, starts_at: r.starts_at, ends_at: r.ends_at })),
              ...evList.map((e) => ({ id: `e-${e.id}`, starts_at: e.starts_at, ends_at: e.ends_at })),
            ];
            const layout = layoutOverlaps(layInput);
            const laneStyle = (id: string) => {
              const l = layout.get(id) ?? { colIdx: 0, colCount: 1 };
              const widthPct = 100 / l.colCount;
              const leftPct = widthPct * l.colIdx;
              return { left: `${leftPct}%`, width: `${widthPct}%` } as React.CSSProperties;
            };
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
                      ? "bg-[#5A8BB0]/15 text-[#487596] border-[#5A8BB0]/40 hover:bg-[#5A8BB0]/25"
                      : "bg-[#8B6BAA]/15 text-[#7A5C99] border-[#8B6BAA]/40 hover:bg-[#8B6BAA]/25";
                  return (
                    <button
                      type="button"
                      key={`ev-${e.id}`}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onPickEvent(e);
                      }}
                      className={`absolute px-1 py-0.5 rounded text-left text-[11px] font-medium border cursor-pointer ${cls}`}
                      style={{ top: `${top}px`, height: `${height}px`, ...laneStyle(`e-${e.id}`) }}
                      title={e.description ?? e.title}
                    >
                      <div className="truncate font-semibold">
                        {e.type === "center" ? "센터·" : "개인·"}
                        {e.title}
                      </div>
                    </button>
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
                      className={`absolute px-1 py-0.5 rounded text-left text-[11px] font-medium border ${color.bg} ${color.text} cursor-grab active:cursor-grabbing ${isDragging ? "opacity-40" : ""}`}
                      style={{ top: `${top}px`, height: `${height}px`, ...laneStyle(`r-${r.id}`) }}
                    >
                      <div className="truncate font-semibold pointer-events-none">{r.member_name || "회원"}</div>
                      {sessionBadge(r) && (
                        <div className="truncate text-[10.5px] opacity-80 pointer-events-none font-semibold">
                          {sessionBadge(r)}
                        </div>
                      )}
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
 * 이동 거리 4px 이하면 클릭으로 간주 → onPick. 이상이면 스냅 후 onReschedule 로 확인 요청.
 */
function startWeekDrag(
  e: React.MouseEvent,
  r: Reservation,
  columns: Map<string, HTMLDivElement | null>,
  onPick: (r: Reservation) => void,
  onReschedule: (
    r: Reservation,
    newStartIso: string,
    newEndIso: string,
    newTrainerId?: number,
    newTrainerName?: string
  ) => void,
  setDrag: (s: WeekDragState) => void
) {
  const startX = e.clientX;
  const startY = e.clientY;
  const columnRects: { dayKey: string; left: number; right: number; top: number; width: number }[] = [];
  columns.forEach((el, dayKey) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    columnRects.push({
      dayKey,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.width,
    });
  });
  const origDayKey = kstDateKey(r.starts_at);
  const local = { dx: 0, dy: 0, moved: false };

  const base: WeekDragState = {
    id: r.id,
    reservation: r,
    origDayKey,
    startX,
    startY,
    dx: 0,
    dy: 0,
    moved: false,
    columnRects,
  };
  setDrag(base);

  const onMove = (ev: MouseEvent) => {
    local.dx = ev.clientX - startX;
    local.dy = ev.clientY - startY;
    local.moved = local.moved || Math.hypot(local.dx, local.dy) > 4;
    setDrag({
      ...base!,
      dx: local.dx,
      dy: local.dy,
      moved: local.moved,
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
    onReschedule(r, newStartIso, newEndIso);
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
 * 드래그 중: 스냅된 목표 위치에 원본 예약 카드 모양을 반투명으로 그리고,
 * 커서 옆에 "이동 후 시각" 라벨을 fixed 로 띄운다.
 */
function WeekDragGhost({ drag }: { drag: NonNullable<WeekDragState> }) {
  const r = drag.reservation;
  const target = computeDragTarget(
    { starts_at: r.starts_at, ends_at: r.ends_at },
    drag.dy
  );
  const targetCol = drag.columnRects.find(
    (c) => drag.startX + drag.dx >= c.left && drag.startX + drag.dx <= c.right
  );
  const timeLabel = target
    ? `${String(target.h).padStart(2, "0")}:${String(target.m).padStart(2, "0")}`
    : "";
  const dayLabel = targetCol ? targetCol.dayKey.slice(5).replace("-", "/") : "";
  const ok = Boolean(target && targetCol);
  const color =
    RESERVATION_STATUS_COLOR[r.status] ?? RESERVATION_STATUS_COLOR.booked;

  let cardStyle: React.CSSProperties | null = null;
  if (ok && targetCol && target) {
    const durationMin = target.durationMs / 60000;
    const cardHeight = Math.max(
      SLOT_HEIGHT_PX * 0.9,
      (durationMin / SLOT_MINUTES) * SLOT_HEIGHT_PX
    );
    const withinColMin = (target.h - WORK_START_HOUR) * 60 + target.m;
    const cardTop = targetCol.top + (withinColMin / SLOT_MINUTES) * SLOT_HEIGHT_PX;
    cardStyle = {
      left: targetCol.left + 4,
      top: cardTop,
      width: targetCol.width - 8,
      height: cardHeight,
    };
  }

  return (
    <>
      {cardStyle && (
        <div
          className={`fixed z-40 pointer-events-none px-1.5 py-0.5 rounded border-2 border-dashed text-left text-[11px] font-medium shadow-md ${color.bg} ${color.text} opacity-60 transition-[top,left,width] duration-75 ease-out`}
          style={cardStyle}
        >
          <div className="truncate font-semibold">
            {r.member_name || "회원"}
          </div>
        </div>
      )}
      <div
        className={`fixed z-50 pointer-events-none px-2 py-1 rounded-md text-[11.5px] font-semibold shadow-lg ${
          ok ? "bg-[#6B7B3A] text-white" : "bg-red-500 text-white"
        }`}
        style={{
          left: drag.startX + drag.dx + 14,
          top: drag.startY + drag.dy + 14,
        }}
      >
        {ok ? `${dayLabel} ${timeLabel}` : "이동 불가"}
      </div>
    </>
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
  onEdit,
}: {
  reservation: Reservation;
  onClose: () => void;
  onChange: (next: string, reason?: string) => void;
  onEdit: () => void;
}) {
  const [reason, setReason] = useState<string>("");
  const [reasonNote, setReasonNote] = useState<string>("");
  const [reasonMode, setReasonMode] = useState<null | "cancelled" | "noshow">(null);
  const cancelMode = reasonMode === "cancelled";
  const noshowMode = reasonMode === "noshow";
  const commitReason = () => {
    // 사전 정의 사유 + 자유 텍스트 병합.
    //   '사유 입력' 프리셋은 라벨 자체를 저장하지 않고 자유 텍스트만 사용.
    const isCustomOnly = reason === CUSTOM_REASON_SENTINEL;
    const parts = isCustomOnly ? [reasonNote.trim()] : [reason, reasonNote.trim()];
    const combined = parts.filter(Boolean).join(" · ");
    if (!combined) return;
    onChange(reasonMode as "cancelled" | "noshow", combined);
  };
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

          {/* 담당 강사 / 예약자 / 예약 접수 시각 */}
          <div className="mt-2 grid grid-cols-[64px_1fr] gap-y-0.5 gap-x-2 text-[12px]">
            <span className="text-[#A89B80]">담당 강사</span>
            <span className="text-[#3A342A] dark:text-zinc-200">
              {reservation.trainer_name || `#${reservation.trainer_member_id}`}
            </span>
            <span className="text-[#A89B80]">예약자</span>
            <span className="text-[#3A342A] dark:text-zinc-200">
              {reservation.created_by_name || (reservation.created_by_uid ? "센터 외부" : "—")}
            </span>
            {reservation.created_at && (
              <>
                <span className="text-[#A89B80]">예약한 시간</span>
                <span className="text-[#3A342A] dark:text-zinc-200">
                  {formatDateTimeKST(reservation.created_at)}
                </span>
              </>
            )}
          </div>

          {sessionBadge(reservation) && (
            <div className="mt-2 inline-block px-2 py-0.5 rounded-full text-[11.5px] font-semibold bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A]">
              총 {reservation.session_total}회 중 {reservation.session_index}회째 수업
            </div>
          )}
          {(reservation.status === "noshow" || reservation.status === "cancelled") &&
            reservation.cancelled_reason && (
              <div className="mt-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-800 bg-[#F5F0E5]/60 dark:bg-zinc-900 px-2.5 py-1.5">
                <span className="text-[11.5px] font-semibold text-[#8C8270] dark:text-zinc-500">
                  {reservation.status === "noshow" ? "노쇼 사유" : "취소 사유"}
                </span>
                <div className="mt-0.5 text-[12.5px] text-[#3A342A] dark:text-zinc-200 whitespace-pre-wrap break-words">
                  {reservation.cancelled_reason}
                </div>
              </div>
            )}
          {reservation.booking_reason && (
            <div className="mt-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-800 bg-[#F5F0E5]/60 dark:bg-zinc-900 px-2.5 py-1.5">
              <span className="text-[11.5px] font-semibold text-[#8C8270] dark:text-zinc-500">지난 예약 사유</span>
              <div className="mt-0.5 text-[12.5px] text-[#3A342A] dark:text-zinc-200 whitespace-pre-wrap break-words">
                {reservation.booking_reason}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 space-y-2">
          {!reasonMode ? (
            reservation.status === "noshow" ? (
              // 노쇼 처리된 예약은 되돌리기 + 닫기 만 노출
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onChange("booked")}
                  className="px-3 py-2.5 rounded-lg border border-[#6B7B3A] bg-[#6B7B3A] text-[13px] font-semibold text-white hover:bg-[#5a6932]"
                >
                  예약상태로 변경
                </button>
                <button
                  onClick={onClose}
                  className="px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13px] text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
                >
                  닫기
                </button>
              </div>
            ) : (
            <>
              {reservation.status === "booked" ? (
                // 이미 예약 완료 상태 → '되돌리기' 숨기고 '출석 완료' 를 가로로 길게 (좌우 꽉)
                <button
                  onClick={() => onChange("attended")}
                  className="w-full px-3 py-2.5 rounded-lg border border-[#6B7B3A] text-[13px] font-semibold text-[#6B7B3A] hover:bg-[#6B7B3A]/5"
                >
                  출석 완료
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <ActionBtn label="출석 완료" onClick={() => onChange("attended")} color="green" />
                  <ActionBtn label="예약상태로 변경" onClick={() => onChange("booked")} color="neutral" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <ActionBtn
                  label="예약 취소"
                  onClick={() => {
                    setReasonMode("cancelled");
                    setReason("");
                    setReasonNote("");
                  }}
                  color="neutral"
                />
                <ActionBtn
                  label="노쇼(수업 차감)"
                  onClick={() => {
                    setReasonMode("noshow");
                    setReason("");
                    setReasonNote("");
                  }}
                  color="red"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={onEdit}
                  className="px-3 py-2 rounded-lg border border-[#6B7B3A]/40 bg-[#6B7B3A]/10 text-[13px] font-semibold text-[#6B7B3A] dark:text-[#A8B87A] hover:bg-[#6B7B3A]/20"
                >
                  수정
                </button>
                <button
                  onClick={onClose}
                  className="px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13px] text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
                >
                  닫기
                </button>
              </div>
            </>
            )
          ) : (
            <>
              <div className="text-[11.5px] font-medium text-[#6B5D47] dark:text-zinc-400">
                {cancelMode ? "취소 사유를 선택해 주세요" : "노쇼 사유를 선택해 주세요"}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(cancelMode ? CANCEL_REASONS : NOSHOW_REASONS).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className={`px-2.5 py-2 rounded-lg text-[12.5px] font-medium border transition-colors
                      ${reason === r
                        ? "border-[#6B7B3A] bg-[#6B7B3A]/10 text-[#6B7B3A] dark:text-[#A8B87A]"
                        : "border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300"
                      }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <textarea
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value.slice(0, 200))}
                placeholder={
                  cancelMode
                    ? "취소 내용을 입력해 주세요 (점 하나라도 필수)."
                    : "추가 사유 (예: 연락 없이 미출석). 선택 사유 없이 이 칸만 채워도 돼요."
                }
                maxLength={200}
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[13px] resize-none"
              />
              {(() => {
                // 취소: 사유 선택 + 내용(한 글자라도) 필수 / 노쇼: 기존 규칙
                const noteMissing = cancelMode
                  ? !reason || !reasonNote.trim()
                  : !reasonNote.trim() && (reason === CUSTOM_REASON_SENTINEL || !reason);
                const label = noteMissing
                  ? cancelMode
                    ? "사유 선택 후 내용을 입력해 주세요"
                    : "사유를 입력해 주세요"
                  : cancelMode
                    ? "이 사유로 예약 취소"
                    : "이 사유로 노쇼 처리";
                return (
                  <ActionBtn
                    label={label}
                    onClick={() => {
                      if (noteMissing) return;
                      commitReason();
                    }}
                    color="red"
                  />
                );
              })()}
              <button
                onClick={() => {
                  setReasonMode(null);
                  setReason("");
                  setReasonNote("");
                }}
                className="w-full px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13px] text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
              >
                뒤로
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const CANCEL_REASONS = ["강사 요청", "회원 요청"] as const;
// '사유 입력' 은 프리셋 텍스트를 저장하지 않고 자유 텍스트만 사용하는 스페셜 버튼.
const NOSHOW_REASONS = ["연락 없이 미출석", "당일 취소", "사유 입력"] as const;
const CUSTOM_REASON_SENTINEL = "사유 입력";

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

function formatExpiryBadge(ymd: string): { label: string; detail: string; tone: "normal" | "warn" | "expired" | "infinite" } {
  if (!ymd) return { label: "-", detail: "만료일 없음", tone: "normal" };
  if (ymd === "9999-12-31") return { label: "무기한", detail: "기간 제한 없음", tone: "infinite" };
  const [, m, d] = ymd.split("-").map(Number);
  const detail = `${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")}까지`;
  const target = new Date(`${ymd}T00:00:00+09:00`);
  const now = new Date();
  const nowKstMidnight = new Date(now.getTime() + 9 * 3600_000);
  nowKstMidnight.setUTCHours(0, 0, 0, 0);
  const kstNow = new Date(nowKstMidnight.getTime() - 9 * 3600_000);
  const diffDays = Math.round((target.getTime() - kstNow.getTime()) / (24 * 3600_000));
  if (diffDays < 0) return { label: "만료됨", detail, tone: "expired" };
  if (diffDays === 0) return { label: "오늘 만료", detail, tone: "warn" };
  return {
    label: `D-${diffDays}`,
    detail,
    tone: diffDays <= 7 ? "warn" : "normal",
  };
}

function passMetricClasses(tone: "normal" | "warn" | "expired" | "infinite") {
  if (tone === "expired") {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300";
  }
  if (tone === "warn") {
    return "border-amber-200 bg-amber-50 text-[#9A5B12] dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-300";
  }
  if (tone === "infinite") {
    return "border-[#6B7B3A]/25 bg-[#6B7B3A]/8 text-[#53612D] dark:border-[#A8B87A]/25 dark:bg-[#A8B87A]/10 dark:text-[#C4D48F]";
  }
  return "border-[#D7CCB8] bg-white text-[#4B4438] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200";
}

function remainingTone(remaining: number) {
  if (remaining <= 2) return "warn";
  return "infinite";
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
    group_capacity?: number;
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
  const [pickedPass, setPickedPass] = useState<AssignedPass | null>(null);

  // 그룹 수업 정원이 2명 이상이면 추가 참가 회원(각자 본인의 유효 수강권)을 함께 예약할 수 있다.
  interface GroupParticipant {
    memberId: number;
    memberName: string;
    passId: number;
    passLabel: string; // 화면에 표기할 lesson_kind + 잔여 요약
  }
  const [groupParticipants, setGroupParticipants] = useState<GroupParticipant[]>([]);
  const [showAddParticipant, setShowAddParticipant] = useState(false);

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
    setPickedPass(null);
    setGroupParticipants([]);
    setShowAddParticipant(false);
    setOtherResults([]);
    setOtherPasses([]);
    setSearchMode("assigned");
    setFilterText("");
    setAssigned([]); // 이전 강사의 결과가 남지 않도록 즉시 비움
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
    setPickedPass(p);
    setGroupParticipants([]);
    if (p.session_minutes) setDuration(p.session_minutes);
  };

  const pickOtherMember = (m: { id: number; name: string; phone: string | null }) => {
    setPicked(m);
    setPickedPass(null);
    setGroupParticipants([]);
    setOtherResults([]);
    loadPassesForMember(m.id);
  };

  // 다른 회원 검색 후 pass 선택 시에도 pickedPass 저장
  const pickOtherPass = (p: AssignedPass) => {
    setPassId(p.id);
    setPickedPass(p);
    setGroupParticipants([]);
    if (p.session_minutes) setDuration(p.session_minutes);
  };

  // 그룹 수업 결제 회원 리스트에서 바로 추가 (검색 없이).
  const addGroupParticipant = (p: AssignedPass) => {
    if (picked && picked.id === p.member_id) return;
    if (groupParticipants.some((g) => g.memberId === p.member_id)) return;
    setGroupParticipants((cur) => [
      ...cur,
      {
        memberId: p.member_id,
        memberName: p.member_name,
        passId: p.id,
        passLabel: `${p.lesson_kind} · 잔여 ${p.remaining_sessions}회`,
      },
    ]);
    setShowAddParticipant(false);
  };

  const removeParticipant = (idx: number) =>
    setGroupParticipants((cur) => cur.filter((_, i) => i !== idx));

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
        // 주 pass + 그룹 참가자들 각각 예약 생성 (같은 시간대 공유).
        const allPassIds = [passId!, ...groupParticipants.map((g) => g.passId)];
        let lastRes: Response | null = null;
        const failed: string[] = [];
        for (const pid of allPassIds) {
          const r = await fetch("/api/crm/reservations", {
            method: "POST",
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            body: JSON.stringify({
              pass_id: pid,
              starts_at: startsAt,
              ends_at: endsAt,
              // 사용자가 모달에서 선택한 담당 강사를 서버가 존중하도록 명시 전달.
              // 서버는 그 강사가 pass 의 담당/추가 강사이거나, 요청자가 canManageAll 이면 허용.
              trainer_member_id: slot.trainerId,
            }),
          });
          lastRes = r;
          if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            failed.push(d?.error || `${pid} 예약 실패`);
          }
        }
        if (failed.length > 0) throw new Error(failed.join(" · "));
        res = lastRes as Response;
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
          <div className="px-3 py-2.5 rounded-lg bg-[#FBF7EB] dark:bg-zinc-900/60 border border-[#E8E0D0]/70 dark:border-zinc-800 text-[12.5px] text-[#6B5D47] dark:text-zinc-400 space-y-2">
            <div>
              <div className="mb-1 text-[12.5px] font-semibold text-[#6B5D47] dark:text-zinc-300">
                담당 강사
              </div>
              <select
                value={slot.trainerId}
                onChange={(e) => {
                  const t = trainers.find((x) => x.id === Number(e.target.value));
                  if (t) onChangeTrainer(t);
                }}
                className="w-full px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100 focus:outline-none focus:border-[#6B7B3A]"
              >
                {trainers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.display_name}
                    {t.role !== "trainer" &&
                      ` (${t.role === "owner" ? "대표자" : t.role === "admin" ? "관리자" : "팀장"})`}
                  </option>
                ))}
              </select>
            </div>
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

          {/* 수업 길이 — 수강권 선택된 레슨 예약이면 pass.session_minutes 로 잠금 (서버도 강제) */}
          <div>
            <div className="text-[12.5px] font-medium text-[#6B5D47] dark:text-zinc-400 mb-1.5">
              수업 시간(분)
              {eventType === "lesson" && passId && (
                <span className="ml-2 text-[11px] text-[#B47B2A] dark:text-amber-300">
                  수강권 설정으로 자동 적용
                </span>
              )}
            </div>
            {eventType === "lesson" && passId ? (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#6B7B3A]/40 bg-[#6B7B3A]/5 text-[#3A342A] dark:text-zinc-100 text-[13px]">
                <span className="font-semibold text-[#6B7B3A] dark:text-[#A8B87A]">
                  {duration}분
                </span>
                <span className="text-[11.5px] text-[#8C8270]">잠금</span>
              </div>
            ) : (
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
            )}
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
                <div className="mb-3 rounded-xl border border-[#E8E0D0]/80 bg-[#F7F1E4] p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[12.5px] font-semibold text-[#3A342A] dark:text-zinc-100">
                        회원 찾기
                      </div>
                      <div className="text-[11px] text-[#8C8270] dark:text-zinc-500">
                        이름이나 수업 종류로 빠르게 좁혀보세요
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-[#6B7B3A] ring-1 ring-[#E8E0D0] dark:bg-zinc-950 dark:ring-zinc-700">
                      {filteredAssigned.length}명
                    </span>
                  </div>
                  <input
                    type="text"
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    placeholder="회원명 또는 수업명 검색"
                    className="w-full rounded-lg border border-[#D9CEBA] bg-white px-3 py-2.5 text-[13px] text-[#2A251D] shadow-sm outline-none transition focus:border-[#6B7B3A] focus:ring-2 focus:ring-[#6B7B3A]/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </div>
                {loadingAssigned ? (
                  <div className="px-3 py-4 text-center text-[12.5px] text-[#8C8270]">불러오는 중…</div>
                ) : filteredAssigned.length === 0 ? (
                  <div className="px-3 py-4 text-center text-[12.5px] text-[#8C8270] border border-dashed border-[#E8E0D0] dark:border-zinc-700 rounded-lg">
                    {assigned.length === 0
                      ? `${slot.trainerName} 담당 유효 수강권이 없어요.`
                      : "일치하는 결과가 없어요."}
                  </div>
                ) : (
                  <>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-[12.5px] font-semibold text-[#3A342A] dark:text-zinc-100">
                      예약 가능한 회원
                    </div>
                    <div className="text-[11px] text-[#8C8270] dark:text-zinc-500">
                      수강권 상태를 확인하고 선택하세요
                    </div>
                  </div>
                  <ul className="space-y-2 max-h-[300px] overflow-y-auto pr-0.5">
                    {filteredAssigned.map((p) => {
                      const selected = passId === p.id;
                      const expiry = formatExpiryBadge(p.expires_at);
                      const remainingCls = passMetricClasses(remainingTone(p.remaining_sessions));
                      const expiryCls = passMetricClasses(expiry.tone);
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => pickAssignedPass(p)}
                            className={`w-full text-left px-3.5 py-3 rounded-xl border transition-colors
                              ${selected
                                ? "border-[#6B7B3A] bg-[#6B7B3A]/10 shadow-sm ring-1 ring-[#6B7B3A]/20"
                                : "border-[#E8E0D0] bg-[#FEFCF7] hover:border-[#6B7B3A]/40 hover:bg-white dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-900/80"
                              }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex min-w-0 items-center gap-2">
                                  <div className="truncate text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">
                                    {p.member_name || "(이름 없음)"}
                                  </div>
                                  {selected && (
                                    <span className="shrink-0 rounded-full bg-[#6B7B3A] px-2 py-0.5 text-[10.5px] font-semibold text-white">
                                      선택됨
                                    </span>
                                  )}
                                </div>
                                <div className="mt-1 truncate text-[12px] text-[#6B5D47] dark:text-zinc-400">
                                  {p.lesson_kind} · {p.session_minutes}분
                                </div>
                              </div>
                              <div className="shrink-0 rounded-full border border-[#E8E0D0] bg-white px-2.5 py-1 text-[11px] font-medium text-[#8C8270] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                                총 {p.total_sessions}회
                              </div>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <div className={`rounded-lg border px-2.5 py-2 ${remainingCls}`}>
                                <div className="text-[10.5px] font-medium opacity-75">잔여 회수</div>
                                <div className="mt-0.5 text-[13px] font-bold">
                                  {p.remaining_sessions}/{p.total_sessions}회
                                </div>
                              </div>
                              <div className={`rounded-lg border px-2.5 py-2 ${expiryCls}`}>
                                <div className="text-[10.5px] font-medium opacity-75">유효기간</div>
                                <div className="mt-0.5 flex items-baseline gap-1.5">
                                  <span className="text-[13px] font-bold">{expiry.label}</span>
                                  <span className="text-[10.5px] opacity-75">{expiry.detail}</span>
                                </div>
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  </>
                )}
              </>
            ) : (
              <>
                {picked ? (
                  <>
                    <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-[#6B7B3A]/35 bg-[#6B7B3A]/8 px-3 py-2.5">
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
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-[12.5px] font-semibold text-[#3A342A] dark:text-zinc-100">
                        사용할 수강권
                      </div>
                      <div className="text-[11px] text-[#8C8270] dark:text-zinc-500">
                        잔여와 만료일을 확인하세요
                      </div>
                    </div>
                    {loadingOtherPasses ? (
                      <div className="text-[12.5px] text-[#8C8270]">불러오는 중…</div>
                    ) : otherPasses.length === 0 ? (
                      <div className="px-3 py-2.5 rounded-lg border border-dashed border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB]/40 text-[12.5px] text-[#8C8270]">
                        잔여가 있는 유효 수강권이 없어요.
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {otherPasses.map((p) => {
                          const selected = passId === p.id;
                          const expiry = formatExpiryBadge(p.expires_at);
                          const remainingCls = passMetricClasses(remainingTone(p.remaining_sessions));
                          const expiryCls = passMetricClasses(expiry.tone);
                          return (
                            <li key={p.id}>
                              <button
                                type="button"
                                onClick={() => pickOtherPass(p)}
                                className={`w-full text-left px-3.5 py-3 rounded-xl border transition-colors
                                  ${selected
                                    ? "border-[#6B7B3A] bg-[#6B7B3A]/10 shadow-sm ring-1 ring-[#6B7B3A]/20"
                                    : "border-[#E8E0D0] bg-[#FEFCF7] hover:border-[#6B7B3A]/40 hover:bg-white dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-900/80"
                                  }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <div className="truncate text-[13.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
                                        {p.lesson_kind}
                                      </div>
                                      {selected && (
                                        <span className="shrink-0 rounded-full bg-[#6B7B3A] px-2 py-0.5 text-[10.5px] font-semibold text-white">
                                          선택됨
                                        </span>
                                      )}
                                    </div>
                                    <div className="mt-1 truncate text-[12px] text-[#6B5D47] dark:text-zinc-400">
                                      {p.session_minutes}분
                                      {p.trainer_member_id !== slot.trainerId && (
                                        <span className="ml-2 text-[#B47B2A]">다른 강사 수강권</span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="shrink-0 rounded-full border border-[#E8E0D0] bg-white px-2.5 py-1 text-[11px] font-medium text-[#8C8270] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                                    총 {p.total_sessions}회
                                  </div>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                  <div className={`rounded-lg border px-2.5 py-2 ${remainingCls}`}>
                                    <div className="text-[10.5px] font-medium opacity-75">잔여 회수</div>
                                    <div className="mt-0.5 text-[13px] font-bold">
                                      {p.remaining_sessions}/{p.total_sessions}회
                                    </div>
                                  </div>
                                  <div className={`rounded-lg border px-2.5 py-2 ${expiryCls}`}>
                                    <div className="text-[10.5px] font-medium opacity-75">유효기간</div>
                                    <div className="mt-0.5 flex items-baseline gap-1.5">
                                      <span className="text-[13px] font-bold">{expiry.label}</span>
                                      <span className="text-[10.5px] opacity-75">{expiry.detail}</span>
                                    </div>
                                  </div>
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </>
                ) : (
                  <>
                    <div className="rounded-xl border border-[#E8E0D0]/80 bg-[#F7F1E4] p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                      <div className="mb-2">
                        <div className="text-[12.5px] font-semibold text-[#3A342A] dark:text-zinc-100">
                          회원 검색
                        </div>
                        <div className="text-[11px] text-[#8C8270] dark:text-zinc-500">
                          담당 회원이 아니어도 유효 수강권이 있으면 예약할 수 있어요
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <input
                          className="flex-1 rounded-lg border border-[#D9CEBA] bg-white px-3 py-2.5 text-[13.5px] text-[#2A251D] shadow-sm outline-none transition focus:border-[#6B7B3A] focus:ring-2 focus:ring-[#6B7B3A]/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
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
                    </div>
                    {otherResults.length > 0 && (
                      <ul className="mt-3 space-y-1.5 max-h-[180px] overflow-y-auto">
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

          {/* 그룹 수업 참가자 추가 — 픽 된 수강권의 group_capacity 가 2 이상이면 노출 */}
          {eventType === "lesson" && picked && pickedPass && (pickedPass.group_capacity ?? 1) > 1 && (
            <div className="rounded-lg border border-[#6B7B3A]/40 bg-[#6B7B3A]/5 p-3 space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-[12.5px] font-semibold text-[#3A342A] dark:text-zinc-100">
                  그룹 수업 참가자 ({groupParticipants.length + 1}/{pickedPass.group_capacity}명)
                </div>
                <span className="text-[11px] text-[#8C8270] dark:text-zinc-500">
                  같은 시간대에 함께 예약해요
                </span>
              </div>

              <ul className="space-y-1">
                <li className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-white/70 dark:bg-zinc-900/70 border border-[#E8E0D0]/70 dark:border-zinc-800 text-[12.5px]">
                  <span className="truncate">
                    <strong className="text-[#2A251D] dark:text-zinc-100">{picked.name}</strong>
                    <span className="ml-2 text-[11px] text-[#8C8270]">{pickedPass.lesson_kind}</span>
                  </span>
                  <span className="text-[10.5px] text-[#6B7B3A] dark:text-[#A8B87A]">주 참가자</span>
                </li>
                {groupParticipants.map((g, i) => (
                  <li
                    key={g.memberId}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-white/70 dark:bg-zinc-900/70 border border-[#E8E0D0]/70 dark:border-zinc-800 text-[12.5px]"
                  >
                    <span className="truncate">
                      <strong className="text-[#2A251D] dark:text-zinc-100">{g.memberName}</strong>
                      <span className="ml-2 text-[11px] text-[#8C8270]">{g.passLabel}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeParticipant(i)}
                      className="text-[11px] text-red-600 hover:underline"
                    >
                      제거
                    </button>
                  </li>
                ))}
              </ul>

              {groupParticipants.length + 1 < (pickedPass.group_capacity ?? 1) && (
                showAddParticipant ? (
                  <div className="space-y-1.5 mt-1">
                    <div className="text-[11.5px] text-[#6B5D47] dark:text-zinc-400">
                      이 그룹 수업(<strong>{pickedPass.lesson_kind}</strong>)을 결제한 회원 중에서 선택하세요
                    </div>
                    {(() => {
                      const eligible = assigned.filter(
                        (p) =>
                          p.lesson_kind === pickedPass.lesson_kind &&
                          (p.group_capacity ?? 1) > 1 &&
                          (p.remaining_sessions ?? 0) > 0 &&
                          p.member_id !== picked?.id &&
                          !groupParticipants.some((g) => g.memberId === p.member_id)
                      );
                      if (eligible.length === 0) {
                        return (
                          <div className="px-2.5 py-1.5 rounded border border-dashed border-[#E8E0D0] dark:border-zinc-700 text-[12px] text-[#8C8270]">
                            추가할 수 있는 결제 회원이 없어요.
                          </div>
                        );
                      }
                      return (
                        <ul className="space-y-1 max-h-[180px] overflow-y-auto">
                          {eligible.map((p) => (
                            <li key={p.id}>
                              <button
                                type="button"
                                onClick={() => addGroupParticipant(p)}
                                className="w-full text-left px-2.5 py-1.5 rounded border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-[#6B7B3A] text-[12.5px]"
                              >
                                <div className="font-semibold text-[#2A251D] dark:text-zinc-100">{p.member_name}</div>
                                <div className="text-[11px] text-[#6B5D47] dark:text-zinc-400">
                                  {p.lesson_kind} · 잔여 {p.remaining_sessions}/{p.total_sessions}회
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      );
                    })()}
                    <button
                      type="button"
                      onClick={() => setShowAddParticipant(false)}
                      className="w-full px-3 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12px] text-[#6B5D47] hover:bg-[#F5F0E5]"
                    >
                      닫기
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAddParticipant(true)}
                    className="w-full px-3 py-1.5 rounded-lg border border-dashed border-[#6B7B3A]/50 text-[12px] font-semibold text-[#6B7B3A] dark:text-[#A8B87A] hover:bg-[#6B7B3A]/10"
                  >
                    + 참가 회원 추가
                  </button>
                )
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
