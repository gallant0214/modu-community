"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/auth-provider";
import { crmInputClass } from "../../_components/crm-modal";
import { formatPhone } from "../../_components/crm-labels";
import {
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
import type {
  CustomField,
  CustomSection,
  TemplateDefinition,
} from "@/app/lib/crm-consultation-template";
import { normalizeDefinition } from "@/app/lib/crm-consultation-template";

export interface ConsultationInitial {
  id?: number;
  [k: string]: unknown;
}

interface Props {
  mode: "create" | "edit";
  initial?: ConsultationInitial;
  /** 신규 생성 시 사용할 상담지 템플릿 ID (탭 상단 셀렉터에서 전달) */
  templateId?: number | null;
  /** 선택된 템플릿의 definition (표준 섹션 포함 여부 + 커스텀 섹션) */
  templateDefinition?: TemplateDefinition | null;
}

interface StaffLite {
  id: number;
  display_name: string;
  role: string;
  status: string;
}

interface MemberSearchHit {
  id: number;
  name: string;
  phone: string | null;
  birth: string | null;
  gender: string | null;
  face_image_thumb?: string | null;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES_10 = [0, 10, 20, 30, 40, 50];

export function ConsultationForm({ mode, initial, templateId, templateDefinition }: Props) {
  const def = useMemo(() => normalizeDefinition(templateDefinition), [templateDefinition]);
  const includeStandard = def.include_standard !== false;
  const customSections: CustomSection[] = def.custom_sections ?? [];
  const router = useRouter();
  const { getIdToken } = useAuth();

  const asStr = (k: string) => (initial?.[k] as string | null | undefined) ?? "";
  const asNum = (k: string) => {
    const v = initial?.[k];
    return typeof v === "number" ? v : v ? Number(v) : "";
  };
  const asArr = (k: string): string[] =>
    Array.isArray(initial?.[k]) ? (initial![k] as string[]) : [];
  const asBool = (k: string) => Boolean(initial?.[k]);

  // 상단 기본 정보
  const [memberId, setMemberId] = useState<number | null>(
    (initial?.member_id as number | null | undefined) ?? null
  );
  const [name, setName] = useState(asStr("name"));
  const [gender, setGender] = useState(asStr("gender"));
  const [birth, setBirth] = useState(asStr("birth"));
  const [phone, setPhone] = useState(asStr("phone"));
  const [addressDong, setAddressDong] = useState(asStr("address_dong"));
  const [trainerId, setTrainerId] = useState<number | "">(
    (initial?.trainer_member_id as number | null | undefined) ?? ""
  );
  const [trainerNameCustom, setTrainerNameCustom] = useState<string>(
    (initial?.trainer_name_custom as string | null | undefined) ?? ""
  );
  // 초기값에 커스텀 이름이 있으면 직접입력 모드로 시작
  const [trainerMode, setTrainerMode] = useState<"select" | "custom">(
    initial?.trainer_name_custom ? "custom" : "select"
  );
  const [consultedAt, setConsultedAt] = useState(
    asStr("consulted_at") || new Date().toISOString().slice(0, 10)
  );

  // 운동경험
  const [recentYearHistory, setRecentYearHistory] = useState(asStr("recent_year_history"));
  const [pastSports, setPastSports] = useState<string[]>(asArr("past_sports"));
  const [pastSportsEtc, setPastSportsEtc] = useState(asStr("past_sports_etc"));
  const [experienceLength, setExperienceLength] = useState(asStr("experience_length"));
  const [motivation, setMotivation] = useState(asStr("motivation"));
  const [goals, setGoals] = useState<string[]>(asArr("goals"));
  const [goalsEtc, setGoalsEtc] = useState(asStr("goals_etc"));
  const [workoutMethod, setWorkoutMethod] = useState(asStr("workout_method"));
  const [preferredTrainer, setPreferredTrainer] = useState(asStr("preferred_trainer"));
  const [referralSource, setReferralSource] = useState(asStr("referral_source"));

  // 영양
  const [mealMorningTime, setMealMorningTime] = useState(asStr("meal_morning_time"));
  const [mealMorningMenu, setMealMorningMenu] = useState(asStr("meal_morning_menu"));
  const [mealLunchTime, setMealLunchTime] = useState(asStr("meal_lunch_time"));
  const [mealLunchMenu, setMealLunchMenu] = useState(asStr("meal_lunch_menu"));
  const [mealDinnerTime, setMealDinnerTime] = useState(asStr("meal_dinner_time"));
  const [mealDinnerMenu, setMealDinnerMenu] = useState(asStr("meal_dinner_menu"));
  const [mealHabits, setMealHabits] = useState<string[]>(asArr("meal_habits"));
  const [preferredFoods, setPreferredFoods] = useState<string[]>(asArr("preferred_foods"));
  const [preferredFoodsEtc, setPreferredFoodsEtc] = useState(asStr("preferred_foods_etc"));
  const [waterLiters, setWaterLiters] = useState<number | "">(asNum("water_liters_per_day"));
  const [caffeineCups, setCaffeineCups] = useState<number | "">(asNum("caffeine_cups_per_day"));
  const [alcoholPeriod, setAlcoholPeriod] = useState(asStr("alcohol_period"));
  const [alcoholCount, setAlcoholCount] = useState<number | "">(asNum("alcohol_count"));
  const [smoking, setSmoking] = useState(asBool("smoking"));
  const [cigarettesPerDay, setCigarettesPerDay] = useState<number | "">(
    asNum("cigarettes_per_day")
  );
  const [supplements, setSupplements] = useState(asStr("supplements"));
  const [dietExperience, setDietExperience] = useState(asBool("diet_experience"));
  const [dietExperienceDetail, setDietExperienceDetail] = useState(asStr("diet_experience_detail"));

  // 근무 패턴
  const [job, setJob] = useState(asStr("job"));
  const [workStart, setWorkStart] = useState(asStr("work_hours_start"));
  const [workEnd, setWorkEnd] = useState(asStr("work_hours_end"));
  const [commute, setCommute] = useState(asStr("commute"));
  const [jobTraits, setJobTraits] = useState<string[]>(asArr("job_traits"));
  const [workNotes, setWorkNotes] = useState(asStr("work_notes"));

  // 컨디션
  const [wakeHour, setWakeHour] = useState<number | "">(asNum("wake_hour"));
  const [wakeMinute, setWakeMinute] = useState<number | "">(asNum("wake_minute"));
  const [sleepHour, setSleepHour] = useState<number | "">(asNum("sleep_hour"));
  const [sleepSatisfaction, setSleepSatisfaction] = useState(asStr("sleep_satisfaction"));
  const [conditionScore, setConditionScore] = useState(asStr("condition_score"));
  const [fatigueWhen, setFatigueWhen] = useState<string[]>(asArr("fatigue_when"));
  const [fatigueReason, setFatigueReason] = useState(asStr("fatigue_reason"));
  const [conditionNotes, setConditionNotes] = useState(asStr("condition_notes"));

  // 통증
  const [injuryHistory, setInjuryHistory] = useState(asStr("injury_history"));
  const [painParts, setPainParts] = useState<string[]>(asArr("pain_parts"));
  const [painPartsEtc, setPainPartsEtc] = useState(asStr("pain_parts_etc"));

  // 병력
  const [conditions, setConditions] = useState<string[]>(asArr("conditions"));
  const [medications, setMedications] = useState(asStr("medications"));
  const [currentState, setCurrentState] = useState(asStr("current_state"));

  // 운동 계획
  const [weeklyFreq, setWeeklyFreq] = useState<number | "">(asNum("weekly_freq"));
  const [plannedDays, setPlannedDays] = useState<string[]>(asArr("planned_days"));
  const [plannedTime, setPlannedTime] = useState(asStr("planned_time"));
  const [requestNote, setRequestNote] = useState(asStr("request_note"));
  const [memo, setMemo] = useState(asStr("memo"));

  // 커스텀 필드 답변 상태 (custom_data JSONB 저장)
  const [customData, setCustomData] = useState<Record<string, unknown>>(() => {
    const raw = initial?.custom_data as Record<string, unknown> | null | undefined;
    return raw && typeof raw === "object" ? { ...raw } : {};
  });
  const setCustomField = (key: string, value: unknown) =>
    setCustomData((prev) => ({ ...prev, [key]: value }));

  // 저장 상태
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // 강사 리스트 로드
  const [staffList, setStaffList] = useState<StaffLite[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        const res = await fetch("/api/crm/staff?scope=names", {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!res.ok) return;
        const d = await res.json();
        const list: StaffLite[] = (d.staff ?? []).map(
          (s: { id: number; display_name: string; role: string; status: string }) => ({
            id: s.id,
            display_name: s.display_name,
            role: s.role,
            status: s.status,
          })
        );
        setStaffList(list);
      } catch {
        /* 무시 */
      }
    })();
  }, [getIdToken]);

  // 회원 검색
  const [memberQuery, setMemberQuery] = useState("");
  const [memberHits, setMemberHits] = useState<MemberSearchHit[]>([]);
  const [memberSearching, setMemberSearching] = useState(false);
  const [showMemberPanel, setShowMemberPanel] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 입력 방식: 신규(수기 입력) vs 기존회원(검색·자동채움)
  const [memberMode, setMemberMode] = useState<"new" | "existing">(
    initial?.member_id ? "existing" : "new"
  );
  const switchToNew = () => {
    setMemberMode("new");
    // 기존 회원 매칭/자동채움 해제 → 수기 입력 시작
    if (memberId) {
      setMemberId(null);
      setName("");
      setPhone("");
      setBirth("");
      setGender("");
    }
    setMemberQuery("");
    setMemberHits([]);
    setShowMemberPanel(false);
  };
  const switchToExisting = () => setMemberMode("existing");

  useEffect(() => {
    if (memberId) return; // 이미 선택된 경우 검색 안 함
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!memberQuery.trim()) {
      setMemberHits([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        setMemberSearching(true);
        const token = await getIdToken();
        const res = await fetch(
          `/api/crm/members?q=${encodeURIComponent(memberQuery.trim())}&limit=15`,
          { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }
        );
        if (!res.ok) return;
        const d = await res.json();
        setMemberHits(d.members ?? []);
      } finally {
        setMemberSearching(false);
      }
    }, 250);
  }, [memberQuery, memberId, getIdToken]);

  const selectMember = useCallback((m: MemberSearchHit) => {
    setMemberId(m.id);
    setName(m.name);
    if (m.phone) setPhone(m.phone);
    if (m.birth) setBirth(m.birth);
    if (m.gender) setGender(m.gender);
    setMemberQuery("");
    setMemberHits([]);
    setShowMemberPanel(false);
  }, []);

  const clearMember = () => {
    setMemberId(null);
  };

  const toggle = (arr: string[], v: string, setter: (a: string[]) => void) => {
    if (arr.includes(v)) setter(arr.filter((x) => x !== v));
    else setter([...arr, v]);
  };

  const save = async () => {
    setError("");
    if (!name.trim()) {
      setError("상담자 이름을 입력해 주세요");
      return;
    }
    setSaving(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const payload = {
        member_id: memberId,
        template_id:
          mode === "edit"
            ? (initial?.template_id as number | null | undefined) ?? null
            : templateId ?? null,
        name: name.trim(),
        gender: gender || null,
        birth: birth || null,
        phone: phone.trim() || null,
        address_dong: addressDong.trim() || null,
        trainer_member_id: trainerMode === "select" ? trainerId || null : null,
        trainer_name_custom: trainerMode === "custom" ? trainerNameCustom.trim() || null : null,
        consulted_at: consultedAt,
        recent_year_history: recentYearHistory,
        past_sports: pastSports,
        past_sports_etc: pastSportsEtc,
        experience_length: experienceLength,
        motivation,
        goals,
        goals_etc: goalsEtc,
        workout_method: workoutMethod,
        preferred_trainer: preferredTrainer,
        referral_source: referralSource,
        meal_morning_time: mealMorningTime,
        meal_morning_menu: mealMorningMenu,
        meal_lunch_time: mealLunchTime,
        meal_lunch_menu: mealLunchMenu,
        meal_dinner_time: mealDinnerTime,
        meal_dinner_menu: mealDinnerMenu,
        meal_habits: mealHabits,
        preferred_foods: preferredFoods,
        preferred_foods_etc: preferredFoodsEtc,
        water_liters_per_day: waterLiters === "" ? null : waterLiters,
        caffeine_cups_per_day: caffeineCups === "" ? null : caffeineCups,
        alcohol_period: alcoholPeriod || null,
        alcohol_count: alcoholCount === "" ? null : alcoholCount,
        smoking,
        cigarettes_per_day: cigarettesPerDay === "" ? null : cigarettesPerDay,
        supplements,
        diet_experience: dietExperience,
        diet_experience_detail: dietExperienceDetail,
        job,
        work_hours_start: workStart,
        work_hours_end: workEnd,
        commute: commute || null,
        job_traits: jobTraits,
        work_notes: workNotes,
        wake_hour: wakeHour === "" ? null : wakeHour,
        wake_minute: wakeMinute === "" ? null : wakeMinute,
        sleep_hour: sleepHour === "" ? null : sleepHour,
        sleep_satisfaction: sleepSatisfaction || null,
        condition_score: conditionScore || null,
        fatigue_when: fatigueWhen,
        fatigue_reason: fatigueReason,
        condition_notes: conditionNotes,
        injury_history: injuryHistory,
        pain_parts: painParts,
        pain_parts_etc: painPartsEtc,
        conditions,
        medications,
        current_state: currentState,
        weekly_freq: weeklyFreq === "" ? null : weeklyFreq,
        planned_days: plannedDays,
        planned_time: plannedTime,
        request_note: requestNote,
        memo,
        custom_data: customData,
      };
      const url =
        mode === "edit" && initial?.id
          ? `/api/crm/consultations/${initial.id}`
          : `/api/crm/consultations`;
      const method = mode === "edit" ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "저장 실패");
      const newId = mode === "edit" ? initial?.id : data.id;
      router.push(`/crm/consultations/${newId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  const activeTrainers = useMemo(
    () => staffList.filter((s) => s.status === "active"),
    [staffList]
  );

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 pb-16">
      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* ===== 상단 : 회원 검색 + 기본 정보 ===== */}
      <Section
        title="회원 · 기본 정보"
        required
        headerRight={
          <div className="flex items-center rounded-lg border border-[#E8E0D0] dark:border-zinc-700 overflow-hidden shrink-0">
            <button
              type="button"
              onClick={switchToNew}
              className={`px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                memberMode === "new"
                  ? "bg-[#6B7B3A] text-white"
                  : "bg-white dark:bg-zinc-950 text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5]"
              }`}
            >
              신규
            </button>
            <button
              type="button"
              onClick={switchToExisting}
              className={`px-3 py-1.5 text-[12px] font-semibold border-l border-[#E8E0D0] dark:border-zinc-700 transition-colors ${
                memberMode === "existing"
                  ? "bg-[#6B7B3A] text-white"
                  : "bg-white dark:bg-zinc-950 text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5]"
              }`}
            >
              기존회원
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          {memberMode === "existing" && (memberId ? (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border-2 border-[#6B7B3A]/40 bg-[#F3F7EA]/60 dark:bg-emerald-950/20">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-[#6B7B3A]">센터 회원 매칭됨</div>
                <div className="text-[14px] font-bold text-[#2A251D] dark:text-zinc-100 truncate">
                  {name} {phone && <span className="text-[12px] text-[#6B5D47]">· {formatPhone(phone)}</span>}
                </div>
              </div>
              <button
                type="button"
                onClick={clearMember}
                className="shrink-0 px-3 py-1 rounded-md border border-[#E8E0D0] text-[12px] text-[#6B5D47] hover:bg-white"
              >
                매칭 해제
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                type="text"
                value={memberQuery}
                onFocus={() => setShowMemberPanel(true)}
                onChange={(e) => {
                  setMemberQuery(e.target.value);
                  setShowMemberPanel(true);
                }}
                placeholder="센터 회원 검색 (이름·연락처) — 헬스 회원이 상담 요청하는 경우"
                className={crmInputClass}
              />
              {showMemberPanel && memberQuery.trim() && (
                <div className="absolute z-20 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg">
                  {memberSearching && (
                    <div className="px-3 py-2 text-[12px] text-[#A89B80]">검색 중…</div>
                  )}
                  {!memberSearching && memberHits.length === 0 && (
                    <div className="px-3 py-2 text-[12px] text-[#A89B80]">
                      매칭되는 회원 없음 — 신규 방문자로 입력하세요
                    </div>
                  )}
                  {memberHits.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => selectMember(m)}
                      className="w-full text-left px-3 py-2 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 border-b border-[#E8E0D0]/60 dark:border-zinc-800 last:border-b-0"
                    >
                      <div className="text-[13.5px] font-semibold text-[#2A251D] dark:text-zinc-100">
                        {m.name}
                      </div>
                      <div className="text-[11.5px] text-[#A89B80]">
                        {m.phone ? formatPhone(m.phone) : "연락처 없음"}
                        {m.birth && ` · ${m.birth}`}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="성함" required>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={crmInputClass}
              />
            </Field>
            <Field label="성별">
              <div className="flex gap-1.5">
                {[
                  { v: "M", l: "남" },
                  { v: "F", l: "여" },
                ].map((o) => (
                  <ChipToggle
                    key={o.v}
                    on={gender === o.v}
                    onClick={() => setGender(gender === o.v ? "" : o.v)}
                  >
                    {o.l}
                  </ChipToggle>
                ))}
              </div>
            </Field>
            <Field label="생년월일">
              <input
                type="date"
                value={birth}
                onChange={(e) => setBirth(e.target.value)}
                className={crmInputClass}
              />
            </Field>
            <Field label="전화번호">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={crmInputClass}
                placeholder="010-0000-0000"
              />
            </Field>
            <Field label="주소 (동)">
              <input
                value={addressDong}
                onChange={(e) => setAddressDong(e.target.value)}
                className={crmInputClass}
                placeholder="예: 삼성동"
              />
            </Field>
            <Field label="상담 담당 강사">
              <div className="space-y-1.5">
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTrainerMode("select")}
                    className={`px-2.5 py-1 rounded-full text-[11.5px] font-semibold border transition-colors ${
                      trainerMode === "select"
                        ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
                        : "border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300"
                    }`}
                  >
                    명단 선택
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrainerMode("custom")}
                    className={`px-2.5 py-1 rounded-full text-[11.5px] font-semibold border transition-colors ${
                      trainerMode === "custom"
                        ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
                        : "border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300"
                    }`}
                  >
                    직접 입력
                  </button>
                </div>
                {trainerMode === "select" ? (
                  <select
                    value={trainerId}
                    onChange={(e) => {
                      setTrainerId(e.target.value ? Number(e.target.value) : "");
                      setTrainerNameCustom("");
                    }}
                    className={crmInputClass}
                  >
                    <option value="">선택</option>
                    {activeTrainers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.display_name} ({s.role})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={trainerNameCustom}
                    onChange={(e) => {
                      setTrainerNameCustom(e.target.value);
                      setTrainerId("");
                    }}
                    className={crmInputClass}
                    placeholder="예: 외부 강사 · 미등록 담당자 이름"
                  />
                )}
              </div>
            </Field>
            <Field label="상담일">
              <input
                type="date"
                value={consultedAt}
                onChange={(e) => setConsultedAt(e.target.value)}
                className={crmInputClass}
              />
            </Field>
          </div>
        </div>
      </Section>

      {/* ===== 표준 섹션 (템플릿에서 include_standard=false 이면 숨김) ===== */}
      {includeStandard && (
      <>
      {/* ===== 운동 경험 ===== */}
      <Section title="운동 경험">
        <div className="space-y-3">
          <Field label="최근 1년간 운동 경력">
            <textarea
              value={recentYearHistory}
              onChange={(e) => setRecentYearHistory(e.target.value)}
              className={`${crmInputClass} min-h-[60px]`}
              placeholder="예: 헬스 6개월, 크로스핏 3개월…"
            />
          </Field>
          <Field label="과거 운동 종목">
            <ChipList
              options={PAST_SPORTS.map((s) => ({ v: s.v, l: s.l }))}
              value={pastSports}
              onToggle={(v) => toggle(pastSports, v, setPastSports)}
            />
            <input
              value={pastSportsEtc}
              onChange={(e) => setPastSportsEtc(e.target.value)}
              className={`${crmInputClass} mt-2`}
              placeholder="기타 (선택)"
            />
          </Field>
          <Field label="운동 경력">
            <ChipList
              single
              options={EXPERIENCE_LENGTHS.map((s) => ({ v: s.v, l: s.l }))}
              value={experienceLength ? [experienceLength] : []}
              onToggle={(v) => setExperienceLength(experienceLength === v ? "" : v)}
            />
          </Field>
          <Field label="운동 동기 / 계기">
            <textarea
              value={motivation}
              onChange={(e) => setMotivation(e.target.value)}
              className={`${crmInputClass} min-h-[60px]`}
            />
          </Field>
          <Field label="목표">
            <ChipList
              options={GOALS.map((s) => ({ v: s.v, l: s.l }))}
              value={goals}
              onToggle={(v) => toggle(goals, v, setGoals)}
            />
            <input
              value={goalsEtc}
              onChange={(e) => setGoalsEtc(e.target.value)}
              className={`${crmInputClass} mt-2`}
              placeholder="기타 목표"
            />
          </Field>
          <Field label="운동 방법">
            <textarea
              value={workoutMethod}
              onChange={(e) => setWorkoutMethod(e.target.value)}
              className={`${crmInputClass} min-h-[50px]`}
              placeholder="상담 중 논의한 운동 방법 (선택)"
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="희망 트레이너">
              <input
                value={preferredTrainer}
                onChange={(e) => setPreferredTrainer(e.target.value)}
                className={crmInputClass}
              />
            </Field>
            <Field label="유입 경로">
              <input
                value={referralSource}
                onChange={(e) => setReferralSource(e.target.value)}
                className={crmInputClass}
                placeholder="예: 지인 소개, 인스타, 검색…"
              />
            </Field>
          </div>
        </div>
      </Section>

      {/* ===== 영양 ===== */}
      <Section title="영양">
        <div className="space-y-3">
          {(
            [
              { label: "아침", timeKey: mealMorningTime, setTime: setMealMorningTime, menu: mealMorningMenu, setMenu: setMealMorningMenu },
              { label: "점심", timeKey: mealLunchTime, setTime: setMealLunchTime, menu: mealLunchMenu, setMenu: setMealLunchMenu },
              { label: "저녁", timeKey: mealDinnerTime, setTime: setMealDinnerTime, menu: mealDinnerMenu, setMenu: setMealDinnerMenu },
            ] as const
          ).map((r) => (
            <div key={r.label} className="grid grid-cols-[64px_120px_1fr] gap-2 items-center">
              <div className="text-[12.5px] font-semibold text-[#6B5D47]">{r.label}</div>
              <input
                type="time"
                value={r.timeKey}
                onChange={(e) => r.setTime(e.target.value)}
                className={crmInputClass}
              />
              <input
                value={r.menu}
                onChange={(e) => r.setMenu(e.target.value)}
                className={crmInputClass}
                placeholder="식사 형태 (예: 밥+반찬)"
              />
            </div>
          ))}

          <Field label="식사 습관">
            <ChipList
              options={MEAL_HABITS.map((s) => ({ v: s.v, l: s.l }))}
              value={mealHabits}
              onToggle={(v) => toggle(mealHabits, v, setMealHabits)}
            />
          </Field>
          <Field label="선호 음식">
            <ChipList
              options={PREFERRED_FOODS.map((s) => ({ v: s.v, l: s.l }))}
              value={preferredFoods}
              onToggle={(v) => toggle(preferredFoods, v, setPreferredFoods)}
            />
            <input
              value={preferredFoodsEtc}
              onChange={(e) => setPreferredFoodsEtc(e.target.value)}
              className={`${crmInputClass} mt-2`}
              placeholder="기타 선호 음식"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="수분 섭취 (리터/일)">
              <input
                type="number"
                step="0.1"
                min={0}
                value={waterLiters}
                onChange={(e) => setWaterLiters(e.target.value === "" ? "" : Number(e.target.value))}
                className={crmInputClass}
              />
            </Field>
            <Field label="카페인 (잔/일)">
              <input
                type="number"
                min={0}
                value={caffeineCups}
                onChange={(e) => setCaffeineCups(e.target.value === "" ? "" : Number(e.target.value))}
                className={crmInputClass}
              />
            </Field>
            <Field label="음주 주기">
              <div className="flex gap-2 items-center">
                <select
                  value={alcoholPeriod}
                  onChange={(e) => setAlcoholPeriod(e.target.value)}
                  className={`${crmInputClass} max-w-[100px]`}
                >
                  <option value="">선택</option>
                  <option value="week">주</option>
                  <option value="month">월</option>
                </select>
                <input
                  type="number"
                  min={0}
                  value={alcoholCount}
                  onChange={(e) => setAlcoholCount(e.target.value === "" ? "" : Number(e.target.value))}
                  className={crmInputClass}
                  placeholder="회"
                />
              </div>
            </Field>
            <Field label="흡연">
              <div className="flex gap-2 items-center">
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={smoking}
                    onChange={(e) => setSmoking(e.target.checked)}
                    className="w-4 h-4 accent-[#6B7B3A]"
                  />
                  <span className="text-[13px]">흡연</span>
                </label>
                <input
                  type="number"
                  min={0}
                  disabled={!smoking}
                  value={cigarettesPerDay}
                  onChange={(e) =>
                    setCigarettesPerDay(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  className={`${crmInputClass} disabled:opacity-50`}
                  placeholder="일 개비"
                />
              </div>
            </Field>
          </div>
          <Field label="섭취 중인 영양제">
            <input
              value={supplements}
              onChange={(e) => setSupplements(e.target.value)}
              className={crmInputClass}
              placeholder="예: 비타민D, 오메가3…"
            />
          </Field>
          <Field label="식단 경험">
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={dietExperience}
                  onChange={(e) => setDietExperience(e.target.checked)}
                  className="w-4 h-4 accent-[#6B7B3A]"
                />
                <span className="text-[13px]">예 (경험 있음)</span>
              </label>
              <input
                value={dietExperienceDetail}
                onChange={(e) => setDietExperienceDetail(e.target.value)}
                disabled={!dietExperience}
                className={`${crmInputClass} disabled:opacity-50`}
                placeholder="구체적으로"
              />
            </div>
          </Field>
        </div>
      </Section>

      {/* ===== 근무 패턴 ===== */}
      <Section title="근무 패턴">
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="직업">
              <input
                value={job}
                onChange={(e) => setJob(e.target.value)}
                className={crmInputClass}
              />
            </Field>
            <Field label="근무 시간">
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={workStart}
                  onChange={(e) => setWorkStart(e.target.value)}
                  className={crmInputClass}
                />
                <span className="text-[13px] text-[#A89B80]">~</span>
                <input
                  type="time"
                  value={workEnd}
                  onChange={(e) => setWorkEnd(e.target.value)}
                  className={crmInputClass}
                />
              </div>
            </Field>
          </div>
          <Field label="출퇴근 수단">
            <ChipList
              single
              options={COMMUTES.map((s) => ({ v: s.v, l: s.l }))}
              value={commute ? [commute] : []}
              onToggle={(v) => setCommute(commute === v ? "" : v)}
            />
          </Field>
          <Field label="직업 형태">
            <ChipList
              options={JOB_TRAITS.map((s) => ({ v: s.v, l: s.l }))}
              value={jobTraits}
              onToggle={(v) => toggle(jobTraits, v, setJobTraits)}
            />
          </Field>
          <Field label="기타 사항">
            <textarea
              value={workNotes}
              onChange={(e) => setWorkNotes(e.target.value)}
              className={`${crmInputClass} min-h-[50px]`}
            />
          </Field>
        </div>
      </Section>

      {/* ===== 컨디션 ===== */}
      <Section title="컨디션">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="기상 시간">
              <div className="flex items-center gap-1.5">
                <select
                  value={wakeHour}
                  onChange={(e) => setWakeHour(e.target.value === "" ? "" : Number(e.target.value))}
                  className={crmInputClass}
                >
                  <option value="">-</option>
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {h}시
                    </option>
                  ))}
                </select>
                <select
                  value={wakeMinute}
                  onChange={(e) => setWakeMinute(e.target.value === "" ? "" : Number(e.target.value))}
                  className={crmInputClass}
                >
                  <option value="">-</option>
                  {MINUTES_10.map((m) => (
                    <option key={m} value={m}>
                      {String(m).padStart(2, "0")}분
                    </option>
                  ))}
                </select>
              </div>
            </Field>
            <Field label="취침 시간">
              <select
                value={sleepHour}
                onChange={(e) => setSleepHour(e.target.value === "" ? "" : Number(e.target.value))}
                className={crmInputClass}
              >
                <option value="">-</option>
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {h}시
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="수면 만족도">
            <ChipList
              single
              options={LEVELS.map((s) => ({ v: s.v, l: s.l }))}
              value={sleepSatisfaction ? [sleepSatisfaction] : []}
              onToggle={(v) => setSleepSatisfaction(sleepSatisfaction === v ? "" : v)}
            />
          </Field>
          <Field label="컨디션 지수">
            <ChipList
              single
              options={LEVELS.map((s) => ({ v: s.v, l: s.l }))}
              value={conditionScore ? [conditionScore] : []}
              onToggle={(v) => setConditionScore(conditionScore === v ? "" : v)}
            />
          </Field>
          <Field label="피로도 시점">
            <ChipList
              options={FATIGUE_WHEN.map((s) => ({ v: s.v, l: s.l }))}
              value={fatigueWhen}
              onToggle={(v) => toggle(fatigueWhen, v, setFatigueWhen)}
            />
          </Field>
          <Field label="피로도 원인">
            <input
              value={fatigueReason}
              onChange={(e) => setFatigueReason(e.target.value)}
              className={crmInputClass}
            />
          </Field>
          <Field label="기타 사항">
            <textarea
              value={conditionNotes}
              onChange={(e) => setConditionNotes(e.target.value)}
              className={`${crmInputClass} min-h-[50px]`}
            />
          </Field>
        </div>
      </Section>

      {/* ===== 통증 체크 ===== */}
      <Section title="통증 체크">
        <div className="space-y-3">
          <Field label="부상 경험">
            <textarea
              value={injuryHistory}
              onChange={(e) => setInjuryHistory(e.target.value)}
              className={`${crmInputClass} min-h-[50px]`}
              placeholder="예: 3년 전 왼쪽 발목 인대 파열…"
            />
          </Field>
          <Field label="통증 부위">
            <ChipList
              options={PAIN_PARTS.map((s) => ({ v: s.v, l: s.l }))}
              value={painParts}
              onToggle={(v) => toggle(painParts, v, setPainParts)}
            />
            <input
              value={painPartsEtc}
              onChange={(e) => setPainPartsEtc(e.target.value)}
              className={`${crmInputClass} mt-2`}
              placeholder="기타 부위 (선택)"
            />
          </Field>
        </div>
      </Section>

      {/* ===== 과거 / 현재 병력 ===== */}
      <Section title="과거 / 현재 병력">
        <div className="space-y-3">
          <Field label="해당 사항을 선택해 주세요">
            <ChipList
              options={CONDITIONS.map((s) => ({ v: s.v, l: s.l }))}
              value={conditions}
              onToggle={(v) => toggle(conditions, v, setConditions)}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="약물 복용 여부">
              <textarea
                value={medications}
                onChange={(e) => setMedications(e.target.value)}
                className={`${crmInputClass} min-h-[60px]`}
                placeholder="복용 중인 약이 있으면 기록"
              />
            </Field>
            <Field label="현재 상태">
              <textarea
                value={currentState}
                onChange={(e) => setCurrentState(e.target.value)}
                className={`${crmInputClass} min-h-[60px]`}
                placeholder="현재 상태 자유 기술"
              />
            </Field>
          </div>
        </div>
      </Section>

      {/* ===== 운동 계획 ===== */}
      <Section title="운동 계획">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="주 몇 회">
              <input
                type="number"
                min={0}
                max={7}
                value={weeklyFreq}
                onChange={(e) => setWeeklyFreq(e.target.value === "" ? "" : Number(e.target.value))}
                className={crmInputClass}
              />
            </Field>
            <Field label="원하는 시간대">
              <input
                value={plannedTime}
                onChange={(e) => setPlannedTime(e.target.value)}
                className={crmInputClass}
                placeholder="예: 오전 10시, 저녁 8시"
              />
            </Field>
          </div>
          <Field label="요일">
            <ChipList
              options={PLANNED_DAYS.map((s) => ({ v: s.v, l: s.l }))}
              value={plannedDays}
              onToggle={(v) => toggle(plannedDays, v, setPlannedDays)}
            />
          </Field>
        </div>
      </Section>

      {/* ===== 강사에게 바라는 점 ===== */}
      <Section title="강사에게 바라는 점 또는 요청 사항">
        <textarea
          value={requestNote}
          onChange={(e) => setRequestNote(e.target.value)}
          className={`${crmInputClass} min-h-[100px]`}
        />
      </Section>
      </>
      )}

      {/* ===== 커스텀 섹션 (템플릿에서 정의) ===== */}
      {customSections.map((s) => (
        <Section key={s.key} title={s.title || "섹션"}>
          <div className="space-y-3">
            {s.fields.length === 0 ? (
              <p className="text-[12px] text-[#A89B80]">이 섹션에 항목이 없습니다.</p>
            ) : (
              s.fields.map((f) => (
                <Field key={f.key} label={f.label}>
                  <CustomFieldInput
                    field={f}
                    value={customData[f.key]}
                    onChange={(v) => setCustomField(f.key, v)}
                  />
                </Field>
              ))
            )}
          </div>
        </Section>
      ))}

      {/* ===== 상담 메모 ===== */}
      <Section title="상담 메모 (내부용)">
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          className={`${crmInputClass} min-h-[80px]`}
          placeholder="트레이너 내부 메모 · 상담 요약 · 다음 액션 등"
        />
      </Section>

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[13.5px] font-medium text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-900"
        >
          취소
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-5 py-2.5 rounded-lg bg-[#6B7B3A] text-white text-[13.5px] font-semibold hover:bg-[#5a6932] disabled:opacity-60"
        >
          {saving ? "저장 중…" : mode === "edit" ? "수정 저장" : "상담 저장"}
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  required,
  headerRight,
  children,
}: {
  title: string;
  required?: boolean;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 px-4 py-4 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">
          {title}
          {required && <span className="text-[#B47B2A] ml-1">*</span>}
        </h2>
        {headerRight}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11.5px] font-semibold text-[#6B5D47] dark:text-zinc-400 mb-1">
        {label}
        {required && <span className="text-[#B47B2A] ml-0.5">*</span>}
      </div>
      {children}
    </div>
  );
}

function ChipList({
  options,
  value,
  onToggle,
  single,
}: {
  options: { v: string; l: string }[];
  value: string[];
  onToggle: (v: string) => void;
  single?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <ChipToggle
          key={o.v}
          on={value.includes(o.v)}
          onClick={() => onToggle(o.v)}
          singleMark={single}
        >
          {o.l}
        </ChipToggle>
      ))}
    </div>
  );
}

function ChipToggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  singleMark?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold border transition-colors ${
        on
          ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
          : "border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300 hover:border-[#6B7B3A]/50"
      }`}
    >
      {children}
    </button>
  );
}

/** 커스텀 필드 타입별 입력 렌더러. */
function CustomFieldInput({
  field,
  value,
  onChange,
}: {
  field: CustomField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const strVal = typeof value === "string" ? value : "";
  const numVal =
    typeof value === "number" ? value : typeof value === "string" && value !== "" ? Number(value) : "";
  const arrVal: string[] = Array.isArray(value) ? (value as string[]) : [];
  const boolVal = value === true;

  if (field.type === "textarea") {
    return (
      <textarea
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className={`${crmInputClass} min-h-[70px]`}
      />
    );
  }
  if (field.type === "number") {
    return (
      <input
        type="number"
        value={numVal}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        placeholder={field.placeholder}
        className={crmInputClass}
      />
    );
  }
  if (field.type === "date") {
    return (
      <input
        type="date"
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
        className={crmInputClass}
      />
    );
  }
  if (field.type === "time") {
    return (
      <input
        type="time"
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
        className={crmInputClass}
      />
    );
  }
  if (field.type === "toggle") {
    return (
      <label className="inline-flex items-center gap-2">
        <input
          type="checkbox"
          checked={boolVal}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 accent-[#6B7B3A]"
        />
        <span className="text-[13px] text-[#3A342A]">예</span>
      </label>
    );
  }
  if (field.type === "chips_multi") {
    const opts = field.options ?? [];
    return (
      <div className="flex flex-wrap gap-1.5">
        {opts.length === 0 && (
          <span className="text-[11.5px] text-[#A89B80]">선택지가 없습니다 (편집에서 추가)</span>
        )}
        {opts.map((o) => {
          const on = arrVal.includes(o.v);
          return (
            <button
              key={o.v}
              type="button"
              onClick={() =>
                onChange(on ? arrVal.filter((x) => x !== o.v) : [...arrVal, o.v])
              }
              className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold border transition-colors ${
                on
                  ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
                  : "border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300"
              }`}
            >
              {o.l}
            </button>
          );
        })}
      </div>
    );
  }
  if (field.type === "chips_single") {
    const opts = field.options ?? [];
    return (
      <div className="flex flex-wrap gap-1.5">
        {opts.length === 0 && (
          <span className="text-[11.5px] text-[#A89B80]">선택지가 없습니다 (편집에서 추가)</span>
        )}
        {opts.map((o) => {
          const on = strVal === o.v;
          return (
            <button
              key={o.v}
              type="button"
              onClick={() => onChange(on ? "" : o.v)}
              className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold border transition-colors ${
                on
                  ? "border-[#6B7B3A] bg-[#6B7B3A] text-white"
                  : "border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[#3A342A] dark:text-zinc-300"
              }`}
            >
              {o.l}
            </button>
          );
        })}
      </div>
    );
  }
  // default: text
  return (
    <input
      value={strVal}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      className={crmInputClass}
    />
  );
}
