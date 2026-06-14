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

const SLOT_MINUTES = 30;        // 그리드 행 단위 (30분)
const SLOT_HEIGHT_PX = 28;      // 행 높이 (px)
const WORK_START_HOUR = 8;      // 표시 시작 (KST)
const WORK_END_HOUR = 23;       // 표시 종료 (KST)

export default function CrmSchedulePage() {
  const { getIdToken } = useAuth();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Reservation | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch(`/api/crm/reservations?date=${date}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setReservations(data.reservations ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, date]);

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

  // KST 시각 추출
  const kstParts = (iso: string) => {
    const d = new Date(iso);
    // KST = UTC+9
    const utcMs = d.getTime() + 9 * 3600 * 1000;
    const k = new Date(utcMs);
    return {
      h: k.getUTCHours(),
      m: k.getUTCMinutes(),
    };
  };

  const offsetPx = (iso: string) => {
    const { h, m } = kstParts(iso);
    const minutesFromStart = (h - WORK_START_HOUR) * 60 + m;
    return (minutesFromStart / SLOT_MINUTES) * SLOT_HEIGHT_PX;
  };

  return (
    <div className="px-3 md:px-5 py-5 md:py-6 max-w-[1400px] mx-auto">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-[18px] md:text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
          스케줄 관리
        </h1>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-900 text-[13px] text-[#2A251D] dark:text-zinc-100"
        />
        <div className="ml-auto flex items-center gap-1.5 text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
          <button
            onClick={() => {
              const d = new Date(date);
              d.setDate(d.getDate() - 1);
              setDate(d.toISOString().slice(0, 10));
            }}
            className="px-2 py-1 rounded hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
          >
            ‹ 어제
          </button>
          <button
            onClick={() => setDate(new Date().toISOString().slice(0, 10))}
            className="px-2 py-1 rounded hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
          >
            오늘
          </button>
          <button
            onClick={() => {
              const d = new Date(date);
              d.setDate(d.getDate() + 1);
              setDate(d.toISOString().slice(0, 10));
            }}
            className="px-2 py-1 rounded hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
          >
            내일 ›
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>
      ) : trainers.length === 0 ? (
        <div className="px-4 py-10 text-center text-[13px] text-[#8C8270] border border-dashed border-[#E8E0D0] rounded-xl">
          가입된 트레이너가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
          <div className="min-w-[640px]">
            {/* 헤더: 트레이너 컬럼 */}
            <div
              className="grid border-b border-[#E8E0D0] dark:border-zinc-800 bg-[#FBF7EB] dark:bg-zinc-900/80 sticky top-0 z-10"
              style={{
                gridTemplateColumns: `64px repeat(${trainers.length}, minmax(120px, 1fr))`,
              }}
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

            {/* 본문: 시간 축 + 트레이너 컬럼들 */}
            <div
              className="relative grid"
              style={{
                gridTemplateColumns: `64px repeat(${trainers.length}, minmax(120px, 1fr))`,
                height: `${gridHeightPx}px`,
              }}
            >
              {/* 시간 축 */}
              <div className="relative border-r border-[#E8E0D0] dark:border-zinc-800">
                {slots.map((s, i) => (
                  <div
                    key={i}
                    className="border-b border-[#E8E0D0]/40 dark:border-zinc-800/40 text-[10.5px] text-[#A89B80] dark:text-zinc-500 px-1 leading-none flex items-start"
                    style={{ height: `${SLOT_HEIGHT_PX}px` }}
                  >
                    {s.m === 0 && (
                      <span className="pt-1">{s.label}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* 트레이너 컬럼 */}
              {trainers.map((t) => {
                const list = reservations.filter((r) => r.trainer_member_id === t.id);
                return (
                  <div
                    key={t.id}
                    className="relative border-l border-[#E8E0D0]/70 dark:border-zinc-800"
                  >
                    {/* 슬롯 가이드라인 */}
                    {slots.map((s, i) => (
                      <div
                        key={i}
                        className="border-b border-[#E8E0D0]/30 dark:border-zinc-800/30"
                        style={{ height: `${SLOT_HEIGHT_PX}px` }}
                      />
                    ))}

                    {/* 예약 카드 */}
                    {list.map((r) => {
                      const top = offsetPx(r.starts_at);
                      const bottom = offsetPx(r.ends_at);
                      const height = Math.max(SLOT_HEIGHT_PX * 0.9, bottom - top);
                      const color = RESERVATION_STATUS_COLOR[r.status] ?? RESERVATION_STATUS_COLOR.booked;
                      return (
                        <button
                          key={r.id}
                          onClick={() => setPicked(r)}
                          className={`absolute left-1 right-1 px-2 py-1 rounded-md text-left text-[11.5px] font-medium border ${color.bg} ${color.text}`}
                          style={{
                            top: `${top}px`,
                            height: `${height}px`,
                          }}
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

      <Notice>
        예약 카드를 클릭하면 상태를 변경할 수 있어요. 빈 셀에서 예약을 직접 만드는 기능은 다음 업데이트에 추가할게요.
      </Notice>
    </div>
  );
}

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
            {formatTime(reservation.starts_at)} ~ {formatTime(reservation.ends_at)} ·{" "}
            {RESERVATION_STATUS_LABEL[reservation.status]}
            {reservation.consumed && <span className="ml-1 text-[#B47B2A]">· 차감됨</span>}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <ActionBtn label="출석 완료" onClick={() => onChange("attended")} color="green" />
            <ActionBtn label="예약 완료로 되돌리기" onClick={() => onChange("booked")} color="neutral" />
            <ActionBtn
              label="예약 취소(미차감)"
              onClick={() => onChange("cancelled", reason)}
              color="neutral"
            />
            <ActionBtn
              label="노쇼(차감 취소)"
              onClick={() => onChange("noshow", reason)}
              color="red"
            />
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

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    const utcMs = d.getTime() + 9 * 3600 * 1000;
    const k = new Date(utcMs);
    return `${k.getUTCHours().toString().padStart(2, "0")}:${k.getUTCMinutes().toString().padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 px-3.5 py-2.5 rounded-lg bg-[#FBF7EB] dark:bg-zinc-900/60 border border-[#E8E0D0]/70 dark:border-zinc-800 text-[12.5px] text-[#6B5D47] dark:text-zinc-400">
      <strong className="font-semibold">팁</strong>
      <span className="mx-1.5">·</span>
      {children}
    </div>
  );
}
