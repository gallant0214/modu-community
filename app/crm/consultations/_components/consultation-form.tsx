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
  SAFETY_FLAGS,
  EXERCISE_BARRIERS,
  COACHING_STYLES,
  CONTACT_METHODS,
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

// 생년월일 입력 자동 포맷: 숫자만 남겨 최대 8자리 → "YYYY.MM.DD" (입력 중 부분값도 허용).
// "1986-09-24"(DB date) / "19860924"(수기) 모두 → "1986.09.24" 로 표시.
function formatBirthInput(raw: string): string {
  const d = (raw || "").replace(/\D/g, "").slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}.${d.slice(4)}`;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`;
}
// 표시용 "YYYY.MM.DD" → 저장용 "YYYY-MM-DD" (8자리 완성일 때만, 아니면 null).
function birthToIso(display: string): string | null {
  const d = (display || "").replace(/\D/g, "");
  if (d.length !== 8) return null;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
}

/** 작성 중 자동 임시저장 draft 의 localStorage 키. 신규는 템플릿별, 수정은 상담지 ID별. */
function draftKeyFor(mode: "create" | "edit", initial?: ConsultationInitial, templateId?: number | null): string {
  if (mode === "edit") return `crm_consult_draft:edit:${(initial?.id as number | undefined) ?? "x"}`;
  return `crm_consult_draft:new:${templateId ?? "none"}`;
}

/**
 * 상담지 폼 래퍼. 마운트 시 localStorage 에 저장된 작성중 draft 가 있으면 복구해
 * initial 로 주입한다(자리를 비워 새로고침/탭 종료돼도 작성 내용 유지).
 * SSR/hydration 불일치 방지를 위해 draft 조회는 마운트 후 effect 에서만 수행.
 */
export function ConsultationForm(props: Props) {
  const { mode, initial, templateId } = props;
  const draftKey = draftKeyFor(mode, initial, templateId);
  const [resolved, setResolved] = useState<{
    initial?: ConsultationInitial;
    fromDraft: boolean;
  } | null>(null);

  useEffect(() => {
    let init = initial;
    let fromDraft = false;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw) as Record<string, unknown> | null;
        if (d && typeof d === "object" && Object.keys(d).length > 0) {
          // 원본 메타(id, template_id 등)는 유지하고 draft 값으로 덮어씀
          init = { ...(initial ?? {}), ...d } as ConsultationInitial;
          fromDraft = true;
        }
      }
    } catch {
      /* 손상된 draft 무시 */
    }
    setResolved({ initial: init, fromDraft });
    // draftKey 는 props 로부터 안정적 — 최초 1회만 복구
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  if (!resolved) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-10 text-center text-[13px] text-[#8C8270] dark:text-zinc-500">
        불러오는 중…
      </div>
    );
  }

  return (
    <ConsultationFormInner
      {...props}
      initial={resolved.initial}
      draftKey={draftKey}
      restoredFromDraft={resolved.fromDraft}
    />
  );
}

function ConsultationFormInner({
  mode,
  initial,
  templateId,
  templateDefinition,
  draftKey,
  restoredFromDraft,
}: Props & { draftKey: string; restoredFromDraft: boolean }) {
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
  const nestedObj = (group: string) => {
    const value = initial?.[group];
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  };
  const nestedStr = (group: string, key: string) => {
    const value = nestedObj(group)[key];
    return typeof value === "string" ? value : "";
  };
  const nestedNum = (group: string, key: string): number | "" => {
    const value = nestedObj(group)[key];
    return typeof value === "number" ? value : "";
  };
  const nestedArr = (group: string, key: string): string[] => {
    const value = nestedObj(group)[key];
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  };

  // 상단 기본 정보
  const [memberId, setMemberId] = useState<number | null>(
    (initial?.member_id as number | null | undefined) ?? null
  );
  const [name, setName] = useState(asStr("name"));
  const [gender, setGender] = useState(asStr("gender"));
  const [birth, setBirth] = useState(formatBirthInput(asStr("birth")));
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
  const [experienceLengthOther, setExperienceLengthOther] = useState(nestedStr("selection_other_details", "experience_length"));
  const [mealHabitsOther, setMealHabitsOther] = useState(nestedStr("selection_other_details", "meal_habits"));
  const [commuteOther, setCommuteOther] = useState(nestedStr("selection_other_details", "commute"));
  const [jobTraitsOther, setJobTraitsOther] = useState(nestedStr("selection_other_details", "job_traits"));
  const [fatigueWhenOther, setFatigueWhenOther] = useState(nestedStr("selection_other_details", "fatigue_when"));
  const [conditionsOther, setConditionsOther] = useState(nestedStr("selection_other_details", "conditions"));
  const [primaryGoal, setPrimaryGoal] = useState(nestedStr("goal_details", "primary_goal"));
  const [goalDeadline, setGoalDeadline] = useState(nestedStr("goal_details", "deadline"));
  const [currentMetric, setCurrentMetric] = useState(nestedStr("goal_details", "current_metric"));
  const [targetMetric, setTargetMetric] = useState(nestedStr("goal_details", "target_metric"));
  const [successCriteria, setSuccessCriteria] = useState(nestedStr("goal_details", "success_criteria"));
  const [goalImportance, setGoalImportance] = useState<number | "">(nestedNum("goal_details", "importance"));
  const [goalConfidence, setGoalConfidence] = useState<number | "">(nestedNum("goal_details", "confidence"));

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
  const [sleepMinute, setSleepMinute] = useState<number | "">(asNum("sleep_minute"));
  const [sleepSatisfaction, setSleepSatisfaction] = useState(asStr("sleep_satisfaction"));
  const [conditionScore, setConditionScore] = useState(asStr("condition_score"));
  const [fatigueWhen, setFatigueWhen] = useState<string[]>(asArr("fatigue_when"));
  const [fatigueReason, setFatigueReason] = useState(asStr("fatigue_reason"));
  const [conditionNotes, setConditionNotes] = useState(asStr("condition_notes"));

  // 통증
  const [injuryHistory, setInjuryHistory] = useState(asStr("injury_history"));
  const [painParts, setPainParts] = useState<string[]>(asArr("pain_parts"));
  const [painPartsEtc, setPainPartsEtc] = useState(asStr("pain_parts_etc"));
  const [painIntensity, setPainIntensity] = useState<number | "">(nestedNum("pain_details", "intensity"));
  const [painSide, setPainSide] = useState(nestedStr("pain_details", "side"));
  const [painOnset, setPainOnset] = useState(nestedStr("pain_details", "onset"));
  const [painTrigger, setPainTrigger] = useState(nestedStr("pain_details", "trigger"));
  const [painAvoid, setPainAvoid] = useState(nestedStr("pain_details", "avoid"));
  const [painDiagnosis, setPainDiagnosis] = useState(nestedStr("pain_details", "diagnosis"));
  const [painTreatment, setPainTreatment] = useState(nestedStr("pain_details", "treatment"));

  // 병력
  const [conditions, setConditions] = useState<string[]>(asArr("conditions"));
  const [medications, setMedications] = useState(asStr("medications"));
  const [currentState, setCurrentState] = useState(asStr("current_state"));
  const [safetyFlags, setSafetyFlags] = useState<string[]>(nestedArr("safety_screening", "flags"));
  const [safetyOther, setSafetyOther] = useState(nestedStr("safety_screening", "other"));
  const [clearanceStatus, setClearanceStatus] = useState(nestedStr("safety_screening", "clearance_status"));
  const [clearanceDate, setClearanceDate] = useState(nestedStr("safety_screening", "clearance_date"));
  const [medicalPrecautions, setMedicalPrecautions] = useState(nestedStr("safety_screening", "precautions"));

  // 운동 계획
  const [weeklyFreq, setWeeklyFreq] = useState<number | "">(asNum("weekly_freq"));
  const [plannedDays, setPlannedDays] = useState<string[]>(asArr("planned_days"));
  const [plannedDaysEtc, setPlannedDaysEtc] = useState(asStr("planned_days_etc"));
  const [plannedTime, setPlannedTime] = useState(asStr("planned_time"));
  const [barriers, setBarriers] = useState<string[]>(nestedArr("adherence_details", "barriers"));
  const [barriersOther, setBarriersOther] = useState(nestedStr("adherence_details", "barriers_other"));
  const [dropoutReason, setDropoutReason] = useState(nestedStr("adherence_details", "dropout_reason"));
  const [adherenceSupport, setAdherenceSupport] = useState(nestedStr("adherence_details", "support_needed"));
  const [coachingStyles, setCoachingStyles] = useState<string[]>(nestedArr("coaching_preferences", "styles"));
  const [coachingStylesOther, setCoachingStylesOther] = useState(nestedStr("coaching_preferences", "styles_other"));
  const [touchConsent, setTouchConsent] = useState(nestedStr("coaching_preferences", "touch_consent"));
  const [mediaConsent, setMediaConsent] = useState(nestedStr("coaching_preferences", "media_consent"));
  const [desiredStartDate, setDesiredStartDate] = useState(nestedStr("follow_up_details", "desired_start_date"));
  const [interestedSessions, setInterestedSessions] = useState(nestedStr("follow_up_details", "interested_sessions"));
  const [preferredContact, setPreferredContact] = useState(nestedStr("follow_up_details", "preferred_contact"));
  const [preferredContactOther, setPreferredContactOther] = useState(nestedStr("follow_up_details", "preferred_contact_other"));
  const [contactTime, setContactTime] = useState(nestedStr("follow_up_details", "contact_time"));
  const [followUpDate, setFollowUpDate] = useState(nestedStr("follow_up_details", "follow_up_date"));
  const [followUpNote, setFollowUpNote] = useState(nestedStr("follow_up_details", "follow_up_note"));
  const [hesitationReason, setHesitationReason] = useState(nestedStr("follow_up_details", "hesitation_reason"));
  const [leadTemperature, setLeadTemperature] = useState(nestedStr("follow_up_details", "lead_temperature"));
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
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

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
    if (m.birth) setBirth(formatBirthInput(m.birth));
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
      setDirty(false);
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* 무시 */
      }
      router.push(`/crm/consultations/${newId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  // 폼 전체 스냅샷 — 저장(save)과 자동 임시저장(draft) 공용.
  // 키 구조는 initial 로 그대로 재주입 가능(복구 시 라운드트립)하도록 유지.
  const payload = {
    member_id: memberId,
    template_id:
      mode === "edit"
        ? (initial?.template_id as number | null | undefined) ?? null
        : templateId ?? null,
    name: name.trim(),
    gender: gender || null,
    birth: birthToIso(birth),
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
    goal_details: {
      primary_goal: primaryGoal,
      deadline: goalDeadline,
      current_metric: currentMetric,
      target_metric: targetMetric,
      success_criteria: successCriteria,
      importance: goalImportance === "" ? null : goalImportance,
      confidence: goalConfidence === "" ? null : goalConfidence,
    },
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
    sleep_minute: sleepMinute === "" ? null : sleepMinute,
    sleep_satisfaction: sleepSatisfaction || null,
    condition_score: conditionScore || null,
    fatigue_when: fatigueWhen,
    fatigue_reason: fatigueReason,
    condition_notes: conditionNotes,
    injury_history: injuryHistory,
    pain_parts: painParts,
    pain_parts_etc: painPartsEtc,
    pain_details: {
      intensity: painIntensity === "" ? null : painIntensity,
      side: painSide,
      onset: painOnset,
      trigger: painTrigger,
      avoid: painAvoid,
      diagnosis: painDiagnosis,
      treatment: painTreatment,
    },
    conditions,
    medications,
    current_state: currentState,
    safety_screening: {
      flags: safetyFlags,
      other: safetyOther,
      clearance_status: clearanceStatus,
      clearance_date: clearanceDate,
      precautions: medicalPrecautions,
    },
    weekly_freq: weeklyFreq === "" ? null : weeklyFreq,
    planned_days: plannedDays,
    planned_days_etc: plannedDaysEtc,
    planned_time: plannedTime,
    adherence_details: {
      barriers,
      barriers_other: barriersOther,
      dropout_reason: dropoutReason,
      support_needed: adherenceSupport,
    },
    coaching_preferences: {
      styles: coachingStyles,
      styles_other: coachingStylesOther,
      touch_consent: touchConsent,
      media_consent: mediaConsent,
    },
    follow_up_details: {
      desired_start_date: desiredStartDate,
      interested_sessions: interestedSessions,
      preferred_contact: preferredContact,
      preferred_contact_other: preferredContactOther,
      contact_time: contactTime,
      follow_up_date: followUpDate,
      follow_up_note: followUpNote,
      hesitation_reason: hesitationReason,
      lead_temperature: leadTemperature,
    },
    selection_other_details: {
      experience_length: experienceLengthOther,
      meal_habits: mealHabitsOther,
      commute: commuteOther,
      job_traits: jobTraitsOther,
      fatigue_when: fatigueWhenOther,
      conditions: conditionsOther,
    },
    request_note: requestNote,
    memo,
    custom_data: customData,
  };

  // 작성 중 자동 임시저장: 사용자가 입력한 뒤(dirty) 400ms 디바운스로 localStorage 저장.
  // 자리를 비워 탭이 새로고침/폐기돼도 다음 진입 시 복구된다.
  const payloadJson = JSON.stringify(payload);
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, payloadJson);
      } catch {
        /* 용량 초과 등 무시 */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [payloadJson, dirty, draftKey]);

  // 자리를 비우거나 탭이 백그라운드/종료될 때 즉시 최신 내용을 flush (디바운스 대기 없이).
  const payloadJsonRef = useRef(payloadJson);
  payloadJsonRef.current = payloadJson;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    const flush = () => {
      if (!dirtyRef.current) return;
      try {
        localStorage.setItem(draftKey, payloadJsonRef.current);
      } catch {
        /* 무시 */
      }
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", flush);
    };
  }, [draftKey]);

  // 복구된 draft 를 버리고 처음부터 새로 작성.
  const discardDraft = () => {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* 무시 */
    }
    setDirty(false);
    if (typeof window !== "undefined") window.location.reload();
  };

  const activeTrainers = useMemo(
    () => staffList.filter((s) => s.status === "active"),
    [staffList]
  );

  return (
    <div
      className="max-w-4xl mx-auto px-4 md:px-6 pb-28"
      onInputCapture={() => setDirty(true)}
      onChangeCapture={() => setDirty(true)}
      onClickCapture={(event) => {
        if ((event.target as HTMLElement).closest("button[data-form-choice]")) setDirty(true);
      }}
    >
      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {restoredFromDraft && (
        <div className="mb-3 flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-[12.5px] text-amber-800 dark:text-amber-300">
          <span>작성 중이던 내용을 불러왔어요. 이어서 작성하거나 처음부터 새로 시작할 수 있어요.</span>
          <button
            type="button"
            onClick={discardDraft}
            className="shrink-0 px-2.5 py-1 rounded-md bg-white dark:bg-zinc-900 border border-amber-300 dark:border-amber-800 font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40"
          >
            새로 시작
          </button>
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
                type="text"
                inputMode="numeric"
                value={birth}
                onChange={(e) => setBirth(formatBirthInput(e.target.value))}
                placeholder="예: 20000101 → 2000.01.01"
                maxLength={10}
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
                placeholder="삼성동 또는 아파트 or 오피스텔"
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
              allowOther
              otherText={pastSportsEtc}
              onOtherTextChange={setPastSportsEtc}
              otherPlaceholder="기타 운동 종목을 입력해 주세요"
            />
          </Field>
          <Field label="운동 경력">
            <ChipList
              single
              options={EXPERIENCE_LENGTHS.map((s) => ({ v: s.v, l: s.l }))}
              value={experienceLength ? [experienceLength] : []}
              onToggle={(v) => setExperienceLength(experienceLength === v ? "" : v)}
              allowOther
              otherText={experienceLengthOther}
              onOtherTextChange={setExperienceLengthOther}
              otherPlaceholder="기타 운동 경력을 입력해 주세요"
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
              allowOther
              otherText={goalsEtc}
              onOtherTextChange={setGoalsEtc}
              otherPlaceholder="기타 목표를 입력해 주세요"
            />
          </Field>
          <div className="rounded-xl border border-[#DDE8C5] bg-[#F7FAF0] p-3.5 dark:border-[#65733C] dark:bg-emerald-950/20">
            <h3 className="mb-3 text-[13.5px] font-bold text-[#4D622C] dark:text-emerald-200">목표 구체화</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="가장 중요한 1순위 목표">
                <input value={primaryGoal} onChange={(e) => setPrimaryGoal(e.target.value)} className={crmInputClass} placeholder="예: 체지방 감량" />
              </Field>
              <Field label="목표 기한">
                <input type="date" value={goalDeadline} onChange={(e) => setGoalDeadline(e.target.value)} className={crmInputClass} />
              </Field>
              <Field label="현재 상태·수치 (선택)">
                <input value={currentMetric} onChange={(e) => setCurrentMetric(e.target.value)} className={crmInputClass} placeholder="예: 체중 78kg, 스쿼트 40kg" />
              </Field>
              <Field label="목표 상태·수치 (선택)">
                <input value={targetMetric} onChange={(e) => setTargetMetric(e.target.value)} className={crmInputClass} placeholder="예: 체중 72kg, 스쿼트 60kg" />
              </Field>
              <Field label="목표 중요도">
                <ScoreSelect value={goalImportance} onChange={setGoalImportance} />
              </Field>
              <Field label="달성 자신감">
                <ScoreSelect value={goalConfidence} onChange={setGoalConfidence} />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="성공했다고 판단할 기준">
                <textarea value={successCriteria} onChange={(e) => setSuccessCriteria(e.target.value)} className={`${crmInputClass} min-h-[60px]`} placeholder="예: 주 3회 운동을 3개월 유지하고 허리둘레 5cm 감소" />
              </Field>
            </div>
          </div>
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
            <div key={r.label} className="grid grid-cols-1 sm:grid-cols-[64px_120px_1fr] gap-2 sm:items-center">
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
              allowOther
              otherText={mealHabitsOther}
              onOtherTextChange={setMealHabitsOther}
            />
          </Field>
          <Field label="선호 음식">
            <ChipList
              options={PREFERRED_FOODS.map((s) => ({ v: s.v, l: s.l }))}
              value={preferredFoods}
              onToggle={(v) => toggle(preferredFoods, v, setPreferredFoods)}
              allowOther
              otherText={preferredFoodsEtc}
              onOtherTextChange={setPreferredFoodsEtc}
              otherPlaceholder="기타 선호 음식을 입력해 주세요"
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <div className="space-y-2">
              <label
                className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 py-2.5 transition-colors ${
                  dietExperience
                    ? "border-[#6B7B3A] bg-[#F3F7EA] text-[#35431F] dark:bg-emerald-950/30 dark:text-emerald-200"
                    : "border-[#E8E0D0] bg-white text-[#3A342A] hover:border-[#6B7B3A]/50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                }`}
              >
                <input
                  type="checkbox"
                  checked={dietExperience}
                  onChange={(e) => {
                    setDietExperience(e.target.checked);
                    if (!e.target.checked) setDietExperienceDetail("");
                  }}
                  className="h-5 w-5 shrink-0 accent-[#6B7B3A]"
                />
                <span className="text-[14px] font-semibold leading-5">예 (경험 있음)</span>
              </label>
              {dietExperience && (
                <input
                  value={dietExperienceDetail}
                  onChange={(e) => setDietExperienceDetail(e.target.value)}
                  className={crmInputClass}
                  placeholder="어떤 식단을 얼마나 진행했는지 입력해 주세요"
                />
              )}
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
            {commute === "etc" && (
              <input value={commuteOther} onChange={(e) => setCommuteOther(e.target.value)} className={`${crmInputClass} mt-2`} placeholder="기타 출퇴근 수단을 입력해 주세요" autoFocus />
            )}
          </Field>
          <Field label="직업 형태">
            <ChipList
              options={JOB_TRAITS.map((s) => ({ v: s.v, l: s.l }))}
              value={jobTraits}
              onToggle={(v) => toggle(jobTraits, v, setJobTraits)}
              allowOther
              otherText={jobTraitsOther}
              onOtherTextChange={setJobTraitsOther}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <div className="flex items-center gap-1.5">
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
                <select
                  value={sleepMinute}
                  onChange={(e) => setSleepMinute(e.target.value === "" ? "" : Number(e.target.value))}
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
              allowOther
              otherText={fatigueWhenOther}
              onOtherTextChange={setFatigueWhenOther}
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

      {/* ===== 운동 전 안전 확인 ===== */}
      <Section title="운동 전 안전 확인">
        <div className="space-y-3">
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            아래 항목은 진단이 아니라 안전한 운동 시작을 위한 사전 확인입니다. 해당 시 의료진 확인이 필요할 수 있습니다.
          </p>
          <Field label="현재 또는 최근 경험한 항목">
            <ChipList options={SAFETY_FLAGS.map((s) => ({ v: s.v, l: s.l }))} value={safetyFlags} onToggle={(v) => toggle(safetyFlags, v, setSafetyFlags)} allowOther otherText={safetyOther} onOtherTextChange={setSafetyOther} otherPlaceholder="기타 안전 확인 내용을 입력해 주세요" />
          </Field>
          {safetyFlags.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-3.5 dark:border-amber-800 dark:bg-amber-950/20">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="의료진 운동 확인 상태">
                  <select value={clearanceStatus} onChange={(e) => setClearanceStatus(e.target.value)} className={crmInputClass}>
                    <option value="">선택</option>
                    <option value="pending">확인 예정·대기</option>
                    <option value="cleared">운동 가능 확인 완료</option>
                    <option value="restricted">조건부 가능·제한 있음</option>
                  </select>
                </Field>
                <Field label="확인일">
                  <input type="date" value={clearanceDate} onChange={(e) => setClearanceDate(e.target.value)} className={crmInputClass} />
                </Field>
              </div>
              <div className="mt-3">
                <Field label="의료진 주의사항·운동 제한">
                  <textarea value={medicalPrecautions} onChange={(e) => setMedicalPrecautions(e.target.value)} className={`${crmInputClass} min-h-[64px]`} />
                </Field>
              </div>
            </div>
          )}
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
              allowOther
              otherText={painPartsEtc}
              onOtherTextChange={setPainPartsEtc}
              otherPlaceholder="기타 통증 부위를 입력해 주세요"
            />
          </Field>
          {(painParts.length > 0 || painPartsEtc || injuryHistory) && (
            <div className="rounded-xl border border-[#E8E0D0] bg-white p-3.5 dark:border-zinc-700 dark:bg-zinc-950">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="통증 강도 (0~10)">
                  <input type="number" min={0} max={10} value={painIntensity} onChange={(e) => setPainIntensity(e.target.value === "" ? "" : Number(e.target.value))} className={crmInputClass} />
                </Field>
                <Field label="방향">
                  <select value={painSide} onChange={(e) => setPainSide(e.target.value)} className={crmInputClass}>
                    <option value="">선택</option><option value="left">왼쪽</option><option value="right">오른쪽</option><option value="both">양쪽</option>
                  </select>
                </Field>
                <Field label="시작 시점">
                  <input value={painOnset} onChange={(e) => setPainOnset(e.target.value)} className={crmInputClass} placeholder="예: 약 3개월 전" />
                </Field>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="통증이 발생하는 동작"><input value={painTrigger} onChange={(e) => setPainTrigger(e.target.value)} className={crmInputClass} placeholder="예: 계단 내려가기" /></Field>
                <Field label="피해야 하는 동작"><input value={painAvoid} onChange={(e) => setPainAvoid(e.target.value)} className={crmInputClass} placeholder="예: 깊은 스쿼트" /></Field>
                <Field label="병원 진단명"><input value={painDiagnosis} onChange={(e) => setPainDiagnosis(e.target.value)} className={crmInputClass} /></Field>
                <Field label="치료·재활 상태"><input value={painTreatment} onChange={(e) => setPainTreatment(e.target.value)} className={crmInputClass} placeholder="예: 물리치료 주 1회" /></Field>
              </div>
            </div>
          )}
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
              allowOther
              otherText={conditionsOther}
              onOtherTextChange={setConditionsOther}
              otherPlaceholder="기타 병력·건강 상태를 입력해 주세요"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              allowOther
              otherText={plannedDaysEtc}
              onOtherTextChange={setPlannedDaysEtc}
              otherPlaceholder="기타 일정 조건을 입력해 주세요"
            />
          </Field>
        </div>
      </Section>

      <Section title="운동 지속 및 지도 선호">
        <div className="space-y-4">
          <Field label="운동 지속을 방해할 수 있는 요인">
            <ChipList options={EXERCISE_BARRIERS.map((s) => ({ v: s.v, l: s.l }))} value={barriers} onToggle={(v) => toggle(barriers, v, setBarriers)} allowOther otherText={barriersOther} onOtherTextChange={setBarriersOther} otherPlaceholder="기타 방해 요인을 입력해 주세요" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="이전 운동을 중단한 가장 큰 이유">
              <textarea value={dropoutReason} onChange={(e) => setDropoutReason(e.target.value)} className={`${crmInputClass} min-h-[64px]`} />
            </Field>
            <Field label="운동을 지속하기 위해 필요한 도움">
              <textarea value={adherenceSupport} onChange={(e) => setAdherenceSupport(e.target.value)} className={`${crmInputClass} min-h-[64px]`} />
            </Field>
          </div>
          <Field label="선호하는 지도 방식">
            <ChipList options={COACHING_STYLES.map((s) => ({ v: s.v, l: s.l }))} value={coachingStyles} onToggle={(v) => toggle(coachingStyles, v, setCoachingStyles)} allowOther otherText={coachingStylesOther} onOtherTextChange={setCoachingStylesOther} otherPlaceholder="기타 선호 지도 방식을 입력해 주세요" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="자세 교정을 위한 신체 접촉 동의">
              <YesNoChoice value={touchConsent} onChange={setTouchConsent} />
            </Field>
            <Field label="자세 확인용 사진·영상 촬영 동의">
              <YesNoChoice value={mediaConsent} onChange={setMediaConsent} />
            </Field>
          </div>
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

      <Section title="상담 후속 관리">
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="운동 시작 희망일"><input type="date" value={desiredStartDate} onChange={(e) => setDesiredStartDate(e.target.value)} className={crmInputClass} /></Field>
            <Field label="관심 수업 횟수"><input value={interestedSessions} onChange={(e) => setInterestedSessions(e.target.value)} className={crmInputClass} placeholder="예: 주 2회, 20회권" /></Field>
            <Field label="선호 연락 방식">
              <ChipList single options={CONTACT_METHODS.map((s) => ({ v: s.v, l: s.l }))} value={preferredContact ? [preferredContact] : []} onToggle={(v) => setPreferredContact(preferredContact === v ? "" : v)} allowOther otherText={preferredContactOther} onOtherTextChange={setPreferredContactOther} otherPlaceholder="기타 연락 방식을 입력해 주세요" />
            </Field>
            <Field label="연락 가능한 시간"><input value={contactTime} onChange={(e) => setContactTime(e.target.value)} className={crmInputClass} placeholder="예: 평일 오후 6시 이후" /></Field>
            <Field label="다음 연락 예정일"><input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} className={crmInputClass} /></Field>
            <Field label="등록 가능성">
              <select value={leadTemperature} onChange={(e) => setLeadTemperature(e.target.value)} className={crmInputClass}>
                <option value="">선택</option><option value="hot">높음</option><option value="warm">보통</option><option value="cold">낮음</option>
              </select>
            </Field>
          </div>
          <Field label="등록을 망설이는 이유"><input value={hesitationReason} onChange={(e) => setHesitationReason(e.target.value)} className={crmInputClass} placeholder="예: 근무 일정 확인, 비용 상담 필요" /></Field>
          <Field label="다음 연락·상담 내용"><textarea value={followUpNote} onChange={(e) => setFollowUpNote(e.target.value)} className={`${crmInputClass} min-h-[72px]`} placeholder="예: 8월 15일 저녁에 일정 확인 후 재연락" /></Field>
        </div>
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
                    otherValue={customData[`${f.key}__other`]}
                    onOtherChange={(v) => setCustomField(`${f.key}__other`, v)}
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

      <div className="sticky bottom-3 z-20 flex items-center justify-between gap-3 rounded-2xl border border-[#DDD3C0] bg-white/95 dark:border-zinc-700 dark:bg-zinc-900/95 px-3 py-3 shadow-[0_10px_30px_rgba(70,56,35,0.16)] backdrop-blur">
        <div className="hidden sm:block min-w-0">
          <p className="text-[12px] font-semibold text-[#3A342A] dark:text-zinc-200">
            {dirty ? "저장하지 않은 변경사항이 있어요" : "입력 내용을 확인해 주세요"}
          </p>
          <p className="text-[11px] text-[#8C8270] dark:text-zinc-500">
            저장 후 상담 상세 화면에서 결과를 관리할 수 있습니다.
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (!dirty || window.confirm("작성 중인 내용이 저장되지 않았습니다. 나갈까요?")) router.back();
          }}
          className="px-4 py-2.5 rounded-xl border border-[#E8E0D0] dark:border-zinc-700 text-[14px] font-medium text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
        >
          취소
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="min-w-[112px] px-5 py-2.5 rounded-xl bg-[#6B7B3A] text-white text-[14px] font-bold shadow-sm hover:bg-[#5a6932] disabled:opacity-60"
        >
          {saving ? "저장 중…" : mode === "edit" ? "수정 저장" : "상담 저장"}
        </button>
        </div>
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
    <section className="mb-5 px-4 py-4 md:px-5 md:py-5 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="text-[16px] font-bold text-[#2A251D] dark:text-zinc-100">
          {title}
          {required && <span className="text-[#B47B2A] ml-1">*</span>}
        </h2>
        {headerRight}
      </div>
      {children}
    </section>
  );
}

function ScoreSelect({
  value,
  onChange,
}: {
  value: number | "";
  onChange: (value: number | "") => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      className={crmInputClass}
    >
      <option value="">선택</option>
      {Array.from({ length: 10 }, (_, index) => index + 1).map((score) => (
        <option key={score} value={score}>{score}점</option>
      ))}
    </select>
  );
}

function YesNoChoice({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex gap-1.5">
      {[{ v: "yes", l: "동의" }, { v: "no", l: "동의하지 않음" }].map((option) => (
        <ChipToggle key={option.v} on={value === option.v} onClick={() => onChange(value === option.v ? "" : option.v)}>
          {option.l}
        </ChipToggle>
      ))}
    </div>
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
      <div className="text-[13px] font-bold text-[#2A251D] dark:text-zinc-100 mb-1.5">
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
  allowOther,
  otherText,
  onOtherTextChange,
  otherPlaceholder = "기타 내용을 입력해 주세요",
}: {
  options: { v: string; l: string }[];
  value: string[];
  onToggle: (v: string) => void;
  single?: boolean;
  allowOther?: boolean;
  otherText?: string;
  onOtherTextChange?: (value: string) => void;
  otherPlaceholder?: string;
}) {
  const displayOptions = allowOther ? [...options, { v: "__other", l: "기타" }] : options;
  const otherSelected = value.includes("__other");
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {displayOptions.map((o) => (
          <ChipToggle
            key={o.v}
            on={value.includes(o.v)}
            onClick={() => {
              onToggle(o.v);
              if (o.v === "__other" && otherSelected) onOtherTextChange?.("");
            }}
            singleMark={single}
          >
            {o.l}
          </ChipToggle>
        ))}
      </div>
      {allowOther && otherSelected && (
        <input
          value={otherText ?? ""}
          onChange={(e) => onOtherTextChange?.(e.target.value)}
          className={`${crmInputClass} mt-2`}
          placeholder={otherPlaceholder}
          autoFocus
        />
      )}
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
      data-form-choice
      onClick={onClick}
      className={`min-h-9 px-3 py-1.5 rounded-full text-[13px] font-semibold border transition-colors ${
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
  otherValue,
  onOtherChange,
}: {
  field: CustomField;
  value: unknown;
  onChange: (v: unknown) => void;
  otherValue?: unknown;
  onOtherChange?: (v: string) => void;
}) {
  const strVal = typeof value === "string" ? value : "";
  const numVal =
    typeof value === "number" ? value : typeof value === "string" && value !== "" ? Number(value) : "";
  const arrVal: string[] = Array.isArray(value) ? (value as string[]) : [];
  const boolVal = value === true;
  const otherText = typeof otherValue === "string" ? otherValue : "";

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
    const opts = [...(field.options ?? []), { v: "__other", l: "기타" }];
    return (
      <div className="flex flex-wrap gap-1.5">
        {opts.map((o) => {
          const on = arrVal.includes(o.v);
          return (
            <button
              key={o.v}
              type="button"
              data-form-choice
              onClick={() => {
                onChange(on ? arrVal.filter((x) => x !== o.v) : [...arrVal, o.v]);
                if (o.v === "__other" && on) onOtherChange?.("");
              }}
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
        {arrVal.includes("__other") && (
          <input value={otherText} onChange={(e) => onOtherChange?.(e.target.value)} className={`${crmInputClass} mt-2`} placeholder="기타 내용을 입력해 주세요" autoFocus />
        )}
      </div>
    );
  }
  if (field.type === "chips_single") {
    const opts = [...(field.options ?? []), { v: "__other", l: "기타" }];
    return (
      <div className="flex flex-wrap gap-1.5">
        {opts.map((o) => {
          const on = strVal === o.v;
          return (
            <button
              key={o.v}
              type="button"
              data-form-choice
              onClick={() => {
                onChange(on ? "" : o.v);
                if (o.v === "__other" && on) onOtherChange?.("");
              }}
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
        {strVal === "__other" && (
          <input value={otherText} onChange={(e) => onOtherChange?.(e.target.value)} className={`${crmInputClass} mt-2`} placeholder="기타 내용을 입력해 주세요" autoFocus />
        )}
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
