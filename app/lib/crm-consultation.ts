/**
 * PT 상담지(crm_pt_consultations) 공용 payload 빌더.
 * POST(신규) / PATCH(수정) 라우트에서 재사용.
 * name/status/converted_pass_id 등 상태 필드는 호출측에서 별도 세팅.
 */
export function buildConsultationPayload(
  body: Record<string, unknown>,
  fallbackTrainerId: number
) {
  const asStr = (v: unknown) => (typeof v === "string" ? v.trim() || null : null);
  // 유효한 YYYY-MM-DD 만 통과(존재하지 않는 날짜·형식오류는 null → DATE 컬럼 오류 방지)
  const asDate = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const s = v.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const d = new Date(`${s}T00:00:00Z`);
    return isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
  };
  const asBool = (v: unknown) => v === true;
  // 빈값/null/undefined 는 반드시 null (Number(null)===0, Number("")===0 로 0 이 되는 것 방지).
  // member_id/template_id 등 FK 컬럼에 0 이 들어가면 외래키 위반으로 저장 실패한다.
  const asNum = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const asInt = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? n : null;
  };
  const asArr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  const asObj = (v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};

  // 담당 강사: 명단 선택(trainer_member_id) 또는 직접 입력(trainer_name_custom).
  // 직접 입력이 있으면 fallback 안 함 (기본값이 강사를 오염시키지 않도록).
  const trainerNameCustom = asStr(body.trainer_name_custom);
  const explicitTrainerId = asInt(body.trainer_member_id);
  const hasExplicitTrainerField =
    Object.prototype.hasOwnProperty.call(body, "trainer_member_id") ||
    Object.prototype.hasOwnProperty.call(body, "trainer_name_custom");
  const trainerMemberId = explicitTrainerId
    ? explicitTrainerId
    : hasExplicitTrainerField
      ? null
      : fallbackTrainerId;

  return {
    member_id: asInt(body.member_id) ?? null,
    template_id: asInt(body.template_id) ?? null,
    gender: asStr(body.gender),
    birth: asDate(body.birth),
    phone: asStr(body.phone),
    address_dong: asStr(body.address_dong),
    trainer_member_id: trainerMemberId,
    trainer_name_custom: trainerNameCustom,

    recent_year_history: asStr(body.recent_year_history),
    past_sports: asArr(body.past_sports),
    past_sports_etc: asStr(body.past_sports_etc),
    experience_length: asStr(body.experience_length),
    motivation: asStr(body.motivation),
    goals: asArr(body.goals),
    goals_etc: asStr(body.goals_etc),
    workout_method: asStr(body.workout_method),
    preferred_trainer: asStr(body.preferred_trainer),
    referral_source: asStr(body.referral_source),

    meal_morning_time: asStr(body.meal_morning_time),
    meal_morning_menu: asStr(body.meal_morning_menu),
    meal_lunch_time: asStr(body.meal_lunch_time),
    meal_lunch_menu: asStr(body.meal_lunch_menu),
    meal_dinner_time: asStr(body.meal_dinner_time),
    meal_dinner_menu: asStr(body.meal_dinner_menu),
    meal_habits: asArr(body.meal_habits),
    preferred_foods: asArr(body.preferred_foods),
    preferred_foods_etc: asStr(body.preferred_foods_etc),
    water_liters_per_day: asNum(body.water_liters_per_day),
    caffeine_cups_per_day: asInt(body.caffeine_cups_per_day),
    alcohol_period: asStr(body.alcohol_period),
    alcohol_count: asInt(body.alcohol_count),
    smoking: asBool(body.smoking),
    cigarettes_per_day: asInt(body.cigarettes_per_day),
    supplements: asStr(body.supplements),
    diet_experience: asBool(body.diet_experience),
    diet_experience_detail: asStr(body.diet_experience_detail),

    job: asStr(body.job),
    work_hours_start: asStr(body.work_hours_start),
    work_hours_end: asStr(body.work_hours_end),
    commute: asStr(body.commute),
    job_traits: asArr(body.job_traits),
    work_notes: asStr(body.work_notes),

    wake_hour: asInt(body.wake_hour),
    wake_minute: asInt(body.wake_minute),
    sleep_hour: asInt(body.sleep_hour),
    sleep_minute: asInt(body.sleep_minute),
    sleep_satisfaction: asStr(body.sleep_satisfaction),
    condition_score: asStr(body.condition_score),
    fatigue_when: asArr(body.fatigue_when),
    fatigue_reason: asStr(body.fatigue_reason),
    condition_notes: asStr(body.condition_notes),

    injury_history: asStr(body.injury_history),
    pain_parts: asArr(body.pain_parts),
    pain_parts_etc: asStr(body.pain_parts_etc),

    conditions: asArr(body.conditions),
    conditions_past: asArr(body.conditions_past),
    medications: asStr(body.medications),
    current_state: asStr(body.current_state),
    safety_screening: asObj(body.safety_screening),
    pain_details: asObj(body.pain_details),

    weekly_freq: asInt(body.weekly_freq),
    planned_days: asArr(body.planned_days),
    planned_days_etc: asStr(body.planned_days_etc),
    planned_time: asStr(body.planned_time),
    goal_details: asObj(body.goal_details),
    adherence_details: asObj(body.adherence_details),
    coaching_preferences: asObj(body.coaching_preferences),
    follow_up_details: asObj(body.follow_up_details),
    selection_other_details: asObj(body.selection_other_details),

    request_note: asStr(body.request_note),
    memo: asStr(body.memo),

    // 커스텀 필드 답변 (템플릿 definition 의 field key 로 매핑)
    custom_data:
      body.custom_data && typeof body.custom_data === "object" ? body.custom_data : {},
  };
}
