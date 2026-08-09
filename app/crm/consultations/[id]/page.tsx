"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { formatPhone } from "../../_components/crm-labels";
import { ConsultationForm } from "../_components/consultation-form";
import {
  CONSULT_STATUS_COLOR,
  CONSULT_STATUS_LABEL,
  PAST_SPORTS,
  EXPERIENCE_LENGTHS,
  GOALS,
  MEAL_HABITS,
  PREFERRED_FOODS,
  COMMUTES,
  JOB_TRAITS,
  LEVELS,
  FATIGUE_WHEN,
  PAIN_PARTS,
  CONDITIONS,
  PLANNED_DAYS,
} from "../_labels";
import { normalizeDefinition } from "@/app/lib/crm-consultation-template";

interface Consultation {
  id: number;
  member_id: number | null;
  name: string;
  gender: string | null;
  birth: string | null;
  phone: string | null;
  address_dong: string | null;
  trainer_member_id: number | null;
  trainer_name: string | null;
  status: string;
  converted_at: string | null;
  converted_pass_id: number | null;
  lost_reason: string | null;
  consulted_at: string;
  memo: string | null;
  request_note: string | null;

  recent_year_history: string | null;
  past_sports: string[] | null;
  past_sports_etc: string | null;
  experience_length: string | null;
  motivation: string | null;
  goals: string[] | null;
  goals_etc: string | null;
  workout_method: string | null;
  preferred_trainer: string | null;
  referral_source: string | null;

  meal_morning_time: string | null;
  meal_morning_menu: string | null;
  meal_lunch_time: string | null;
  meal_lunch_menu: string | null;
  meal_dinner_time: string | null;
  meal_dinner_menu: string | null;
  meal_habits: string[] | null;
  preferred_foods: string[] | null;
  preferred_foods_etc: string | null;
  water_liters_per_day: number | null;
  caffeine_cups_per_day: number | null;
  alcohol_period: string | null;
  alcohol_count: number | null;
  smoking: boolean;
  cigarettes_per_day: number | null;
  supplements: string | null;
  diet_experience: boolean;
  diet_experience_detail: string | null;

  job: string | null;
  work_hours_start: string | null;
  work_hours_end: string | null;
  commute: string | null;
  job_traits: string[] | null;
  work_notes: string | null;

  wake_hour: number | null;
  wake_minute: number | null;
  sleep_hour: number | null;
  sleep_satisfaction: string | null;
  condition_score: string | null;
  fatigue_when: string[] | null;
  fatigue_reason: string | null;
  condition_notes: string | null;

  injury_history: string | null;
  pain_parts: string[] | null;
  pain_parts_etc: string | null;

  conditions: string[] | null;
  medications: string | null;
  current_state: string | null;

  weekly_freq: number | null;
  planned_days: string[] | null;
  planned_time: string | null;

  custom_data: Record<string, unknown> | null;
  template: {
    id: number;
    name: string;
    definition: unknown;
  } | null;
}

export default function ConsultationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const { getIdToken } = useAuth();

  const [c, setC] = useState<Consultation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [statusModal, setStatusModal] = useState<"" | "converted" | "lost">("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch(`/api/crm/consultations/${id}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setC(data.consultation);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, id]);

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  const setStatus = async (status: "open" | "converted" | "lost", extras: Record<string, unknown> = {}) => {
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/consultations/${id}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ status, ...extras }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "상태 변경 실패");
      setStatusModal("");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "네트워크 오류");
    }
  };

  const remove = async () => {
    if (!window.confirm("이 상담 기록을 삭제할까요? 되돌릴 수 없어요.")) return;
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/crm/consultations/${id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "삭제 실패");
      router.push("/crm/consultations");
    } catch (e) {
      alert(e instanceof Error ? e.message : "네트워크 오류");
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-5 md:px-8 pt-6 text-[13px] text-[#8C8270]">
        불러오는 중…
      </div>
    );
  }
  if (error || !c) {
    return (
      <div className="max-w-4xl mx-auto px-5 md:px-8 pt-6 text-[13px] text-red-700">
        {error || "상담 정보를 불러올 수 없습니다."}
      </div>
    );
  }

  if (editing) {
    return (
      <div className="px-5 md:px-8 pt-3 pb-8">
        <header className="max-w-4xl mx-auto px-4 md:px-6 mb-4 flex items-baseline justify-between">
          <h1 className="text-[20px] font-bold text-[#2A251D] dark:text-zinc-100">
            PT 상담 수정
          </h1>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-[12px] text-[#6B5D47] hover:underline"
          >
            수정 취소
          </button>
        </header>
        <ConsultationForm
          mode="edit"
          initial={c as unknown as Record<string, unknown>}
          templateDefinition={c.template?.definition ?? null}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 pt-3 pb-16 space-y-4">
      {/* 헤더 */}
      <header className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 p-4 md:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                  CONSULT_STATUS_COLOR[c.status] ?? "bg-zinc-100 text-zinc-700"
                }`}
              >
                {CONSULT_STATUS_LABEL[c.status] ?? c.status}
              </span>
              {c.member_id && (
                <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-[#F3F7EA] text-[#4D622C] border border-[#DDE8C5]">
                  센터 회원
                </span>
              )}
              <span className="text-[11.5px] text-[#8C8270]">{c.consulted_at}</span>
            </div>
            <h1 className="mt-2 text-[24px] font-bold text-[#2A251D] dark:text-zinc-100">
              {c.name}
            </h1>
            <div className="mt-0.5 text-[13px] text-[#6B5D47] dark:text-zinc-400 flex flex-wrap gap-x-3 gap-y-0.5">
              {c.phone && <span>{formatPhone(c.phone)}</span>}
              {c.birth && <span>· {c.birth}</span>}
              {c.gender && <span>· {c.gender === "M" ? "남" : "여"}</span>}
              {c.address_dong && <span>· {c.address_dong}</span>}
              {c.trainer_name && <span>· 담당 {c.trainer_name}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href="/crm/consultations"
              className="px-3 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12px] font-semibold text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5]"
            >
              목록
            </Link>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="px-3 py-1.5 rounded-lg border border-[#6B7B3A] text-[12px] font-semibold text-[#6B7B3A] hover:bg-[#F3F7EA]"
            >
              수정
            </button>
            <button
              type="button"
              onClick={remove}
              className="px-3 py-1.5 rounded-lg border border-red-300 text-[12px] font-semibold text-red-700 hover:bg-red-50"
            >
              삭제
            </button>
          </div>
        </div>

        {/* 전환 상태 관리 */}
        <div className="mt-4 pt-3 border-t border-[#E8E0D0]/70 dark:border-zinc-800">
          <div className="text-[11.5px] font-semibold text-[#8C8270] mb-2">상담 결과</div>
          <div className="flex flex-wrap gap-1.5">
            <ActionBtn
              on={c.status === "open"}
              onClick={() => setStatus("open")}
            >
              진행중
            </ActionBtn>
            <ActionBtn
              on={c.status === "converted"}
              tone="green"
              onClick={() => setStatusModal("converted")}
            >
              PT 등록으로 전환
            </ActionBtn>
            <ActionBtn
              on={c.status === "lost"}
              tone="gray"
              onClick={() => setStatusModal("lost")}
            >
              미등록 처리
            </ActionBtn>
          </div>
          {c.status === "converted" && (
            <p className="mt-2 text-[11.5px] text-emerald-700 dark:text-emerald-300">
              {c.converted_at ? c.converted_at.slice(0, 10) + " 전환" : "전환 완료"}
              {c.converted_pass_id && ` · 수강권 #${c.converted_pass_id}`}
            </p>
          )}
          {c.status === "lost" && c.lost_reason && (
            <p className="mt-2 text-[11.5px] text-[#8C8270]">사유: {c.lost_reason}</p>
          )}
        </div>
      </header>

      {/* 상세 내용 */}
      <SectionCard title="운동 경험">
        <KVList
          rows={[
            ["최근 1년간 경력", c.recent_year_history],
            ["과거 종목", labelJoin(PAST_SPORTS, c.past_sports, c.past_sports_etc)],
            ["운동 경력", labelOne(EXPERIENCE_LENGTHS, c.experience_length)],
            ["운동 동기 · 계기", c.motivation],
            ["목표", labelJoin(GOALS, c.goals, c.goals_etc)],
            ["운동 방법", c.workout_method],
            ["희망 트레이너", c.preferred_trainer],
            ["유입 경로", c.referral_source],
          ]}
        />
      </SectionCard>

      <SectionCard title="영양">
        <KVList
          rows={[
            [
              "아침",
              [c.meal_morning_time, c.meal_morning_menu].filter(Boolean).join(" · ") || null,
            ],
            [
              "점심",
              [c.meal_lunch_time, c.meal_lunch_menu].filter(Boolean).join(" · ") || null,
            ],
            [
              "저녁",
              [c.meal_dinner_time, c.meal_dinner_menu].filter(Boolean).join(" · ") || null,
            ],
            ["식사 습관", labelJoin(MEAL_HABITS, c.meal_habits)],
            ["선호 음식", labelJoin(PREFERRED_FOODS, c.preferred_foods, c.preferred_foods_etc)],
            ["수분 섭취", c.water_liters_per_day ? `${c.water_liters_per_day} 리터/일` : null],
            ["카페인", c.caffeine_cups_per_day ? `${c.caffeine_cups_per_day} 잔/일` : null],
            [
              "음주",
              c.alcohol_period && c.alcohol_count
                ? `${c.alcohol_period === "week" ? "주" : "월"} ${c.alcohol_count}회`
                : null,
            ],
            [
              "흡연",
              c.smoking ? (c.cigarettes_per_day ? `일 ${c.cigarettes_per_day} 개비` : "흡연") : "무",
            ],
            ["섭취 영양제", c.supplements],
            [
              "식단 경험",
              c.diet_experience
                ? c.diet_experience_detail || "예"
                : "아니오",
            ],
          ]}
        />
      </SectionCard>

      <SectionCard title="근무 패턴">
        <KVList
          rows={[
            ["직업", c.job],
            [
              "근무 시간",
              c.work_hours_start || c.work_hours_end
                ? `${c.work_hours_start ?? "?"} ~ ${c.work_hours_end ?? "?"}`
                : null,
            ],
            ["출퇴근", labelOne(COMMUTES, c.commute)],
            ["직업 형태", labelJoin(JOB_TRAITS, c.job_traits)],
            ["기타 사항", c.work_notes],
          ]}
        />
      </SectionCard>

      <SectionCard title="컨디션">
        <KVList
          rows={[
            [
              "기상 시간",
              c.wake_hour !== null
                ? `${c.wake_hour}시${c.wake_minute ? ` ${String(c.wake_minute).padStart(2, "0")}분` : ""}`
                : null,
            ],
            ["취침 시간", c.sleep_hour !== null ? `${c.sleep_hour}시` : null],
            ["수면 만족도", labelOne(LEVELS, c.sleep_satisfaction)],
            ["컨디션 지수", labelOne(LEVELS, c.condition_score)],
            ["피로도 시점", labelJoin(FATIGUE_WHEN, c.fatigue_when)],
            ["피로도 원인", c.fatigue_reason],
            ["기타", c.condition_notes],
          ]}
        />
      </SectionCard>

      <SectionCard title="통증 체크">
        <KVList
          rows={[
            ["부상 경험", c.injury_history],
            ["통증 부위", labelJoin(PAIN_PARTS, c.pain_parts, c.pain_parts_etc)],
          ]}
        />
      </SectionCard>

      <SectionCard title="과거 / 현재 병력">
        <KVList
          rows={[
            ["병력", labelJoin(CONDITIONS, c.conditions)],
            ["약물 복용", c.medications],
            ["현재 상태", c.current_state],
          ]}
        />
      </SectionCard>

      <SectionCard title="운동 계획">
        <KVList
          rows={[
            ["주 몇 회", c.weekly_freq ? `주 ${c.weekly_freq}회` : null],
            ["요일", labelJoin(PLANNED_DAYS, c.planned_days)],
            ["시간대", c.planned_time],
          ]}
        />
      </SectionCard>

      {/* 커스텀 섹션 답변 렌더링 */}
      {c.template && (() => {
        const def = normalizeDefinition(c.template.definition);
        const data = c.custom_data ?? {};
        return (def.custom_sections ?? []).map((s) => {
          const rows: [string, string | null][] = s.fields.map((f) => {
            const v = data[f.key];
            let display: string | null = null;
            if (v == null || v === "") display = null;
            else if (Array.isArray(v)) {
              const labels = v.map((x) => f.options?.find((o) => o.v === x)?.l ?? String(x));
              display = labels.length ? labels.join(", ") : null;
            } else if (typeof v === "boolean") display = v ? "예" : "아니오";
            else if (f.type === "chips_single") {
              display = f.options?.find((o) => o.v === v)?.l ?? String(v);
            } else display = String(v);
            return [f.label, display];
          });
          const hasAny = rows.some(([, val]) => val !== null && val !== "");
          if (!hasAny) return null;
          return (
            <SectionCard key={s.key} title={s.title}>
              <KVList rows={rows} />
            </SectionCard>
          );
        });
      })()}

      {c.request_note && (
        <SectionCard title="강사에게 바라는 점 · 요청 사항">
          <p className="text-[13.5px] leading-relaxed text-[#2A251D] dark:text-zinc-200 whitespace-pre-wrap">
            {c.request_note}
          </p>
        </SectionCard>
      )}

      {c.memo && (
        <SectionCard title="상담 메모 (내부용)">
          <p className="text-[13.5px] leading-relaxed text-[#2A251D] dark:text-zinc-200 whitespace-pre-wrap">
            {c.memo}
          </p>
        </SectionCard>
      )}

      {statusModal === "converted" && (
        <ConvertedModal
          onCancel={() => setStatusModal("")}
          onConfirm={(passId) =>
            setStatus("converted", passId ? { converted_pass_id: passId } : {})
          }
        />
      )}
      {statusModal === "lost" && (
        <LostModal onCancel={() => setStatusModal("")} onConfirm={(reason) => setStatus("lost", { lost_reason: reason })} />
      )}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-white/70 dark:bg-zinc-900 p-4 md:p-5">
      <h2 className="text-[13.5px] font-bold text-[#2A251D] dark:text-zinc-100 mb-3">
        {title}
      </h2>
      {children}
    </section>
  );
}

function KVList({ rows }: { rows: [string, string | null | undefined][] }) {
  const visible = rows.filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "");
  if (visible.length === 0) {
    return <p className="text-[12.5px] text-[#A89B80]">기록된 정보가 없습니다.</p>;
  }
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
      {visible.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[11px] font-semibold text-[#8C8270] dark:text-zinc-500">{k}</dt>
          <dd className="mt-0.5 text-[13px] text-[#2A251D] dark:text-zinc-200 whitespace-pre-wrap break-words">
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function labelJoin(
  opts: readonly { v: string; l: string }[],
  arr: string[] | null | undefined,
  etc?: string | null
): string | null {
  const labels = (arr ?? [])
    .map((v) => opts.find((o) => o.v === v)?.l ?? v)
    .filter(Boolean);
  if (etc && etc.trim()) labels.push(etc.trim());
  return labels.length ? labels.join(", ") : null;
}

function labelOne(
  opts: readonly { v: string; l: string }[],
  v: string | null | undefined
): string | null {
  if (!v) return null;
  return opts.find((o) => o.v === v)?.l ?? v;
}

function ActionBtn({
  on,
  onClick,
  children,
  tone,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "green" | "gray";
}) {
  const base = "px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors";
  if (on) {
    if (tone === "green")
      return (
        <button type="button" onClick={onClick} className={`${base} border-emerald-700 bg-emerald-700 text-white`}>
          {children}
        </button>
      );
    if (tone === "gray")
      return (
        <button type="button" onClick={onClick} className={`${base} border-zinc-500 bg-zinc-500 text-white`}>
          {children}
        </button>
      );
    return (
      <button type="button" onClick={onClick} className={`${base} border-amber-600 bg-amber-500 text-white`}>
        {children}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} border-[#E8E0D0] bg-white dark:bg-zinc-950 dark:border-zinc-700 text-[#3A342A] dark:text-zinc-300 hover:border-[#6B7B3A]`}
    >
      {children}
    </button>
  );
}

function ConvertedModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (passId?: number) => void;
}) {
  const [passId, setPassId] = useState<string>("");
  return (
    <Modal title="PT 등록으로 전환" onClose={onCancel}>
      <p className="text-[12.5px] text-[#6B5D47] mb-3">
        전환된 수강권 ID 를 알고 있다면 입력해 주세요. 몰라도 저장 가능합니다.
      </p>
      <input
        value={passId}
        onChange={(e) => setPassId(e.target.value.replace(/[^0-9]/g, ""))}
        placeholder="수강권 ID (선택)"
        className="w-full h-10 px-3 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px]"
      />
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg border border-[#E8E0D0] text-[13px] text-[#3A342A] hover:bg-[#F5F0E5]"
        >
          취소
        </button>
        <button
          type="button"
          onClick={() => onConfirm(passId ? Number(passId) : undefined)}
          className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-[13px] font-semibold hover:bg-emerald-800"
        >
          전환 저장
        </button>
      </div>
    </Modal>
  );
}

function LostModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Modal title="미등록 처리" onClose={onCancel}>
      <p className="text-[12.5px] text-[#6B5D47] mb-2">사유를 입력하세요 (선택).</p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="예: 가격 부담, 시간 안 맞음, 타 센터 이용…"
        className="w-full min-h-[80px] px-3 py-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px]"
      />
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg border border-[#E8E0D0] text-[13px] text-[#3A342A] hover:bg-[#F5F0E5]"
        >
          취소
        </button>
        <button
          type="button"
          onClick={() => onConfirm(reason)}
          className="px-4 py-2 rounded-lg bg-zinc-600 text-white text-[13px] font-semibold hover:bg-zinc-700"
        >
          미등록 저장
        </button>
      </div>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[15px] font-bold text-[#2A251D] dark:text-zinc-100 mb-3">{title}</h3>
        {children}
      </div>
    </div>
  );
}
