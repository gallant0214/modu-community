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
  const asBool = (v: unknown) => v === true;
  const asNum = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const asInt = (v: unknown) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? n : null;
  };
  const asArr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  return {
    member_id: asInt(body.member_id) ?? null,
    gender: asStr(body.gender),
    birth: asStr(body.birth),
    phone: asStr(body.phone),
    address_dong: asStr(body.address_dong),
    trainer_member_id: asInt(body.trainer_member_id) ?? fallbackTrainerId,

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
    sleep_hour: asInt(body.sleep_hour),
    sleep_satisfaction: asStr(body.sleep_satisfaction),
    condition_score: asStr(body.condition_score),
    fatigue_when: asArr(body.fatigue_when),
    fatigue_reason: asStr(body.fatigue_reason),
    condition_notes: asStr(body.condition_notes),

    injury_history: asStr(body.injury_history),
    pain_parts: asArr(body.pain_parts),
    pain_parts_etc: asStr(body.pain_parts_etc),

    conditions: asArr(body.conditions),
    medications: asStr(body.medications),
    current_state: asStr(body.current_state),

    weekly_freq: asInt(body.weekly_freq),
    planned_days: asArr(body.planned_days),
    planned_time: asStr(body.planned_time),

    request_note: asStr(body.request_note),
    memo: asStr(body.memo),
  };
}
