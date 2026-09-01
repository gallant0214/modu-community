import { supabase } from "@/app/lib/supabase";

interface Rule {
  trigger_type: string;
  threshold_int: number | null;
  message: string;
  enabled: boolean;
  sort_order: number;
}

interface Member {
  id: number;
  name: string;
  birth?: string | null;
}

/**
 * 회원 체크인 후 재생할 음성 안내 문구 배열을 생성.
 * - 활성화된(enabled=true) 규칙만 평가
 * - {name} 치환
 * - 실패해도 체크인 자체를 막지 않도록 caller 에서 try/catch 권장
 */
export async function buildAttendanceVoiceMessages(
  centerId: number,
  member: Member
): Promise<string[]> {
  const { data: rules } = await supabase
    .from("crm_attendance_voice_rules")
    .select("trigger_type, threshold_int, message, enabled, sort_order")
    .eq("center_id", centerId)
    .eq("enabled", true)
    .order("sort_order", { ascending: true });

  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const todayYmd = kstNow.toISOString().slice(0, 10);
  const todayMonthDay = todayYmd.slice(5); // MM-DD

  // 필요한 규칙 종류에 따라 데이터 로드 (규칙이 없어도 아래 만료 대여권/락커 안내는 평가)
  const typedRules = (rules ?? []) as Rule[];
  const hasType = (t: string) => typedRules.some((r) => r.trigger_type === t);

  const [membershipsRes, passesRes] = await Promise.all([
    hasType("expiring_membership")
      ? supabase
          .from("crm_memberships")
          .select("expires_at, status, is_paused")
          .eq("center_id", centerId)
          .eq("member_id", member.id)
          .eq("status", "valid")
          .eq("is_paused", false)
      : Promise.resolve({ data: [] as { expires_at: string }[] }),
    hasType("expiring_pass") || hasType("low_pass_sessions")
      ? supabase
          .from("crm_passes")
          .select("expires_at, remaining_sessions, status")
          .eq("center_id", centerId)
          .eq("member_id", member.id)
          .eq("status", "valid")
      : Promise.resolve({ data: [] as { expires_at: string; remaining_sessions: number }[] }),
  ]);

  const memberships = (membershipsRes.data ?? []) as { expires_at: string }[];
  const passes = (passesRes.data ?? []) as {
    expires_at: string;
    remaining_sessions: number;
  }[];

  const daysUntil = (ymd: string): number => {
    if (!ymd) return Number.POSITIVE_INFINITY;
    const target = new Date(`${ymd.slice(0, 10)}T00:00:00+09:00`);
    const start = new Date(`${todayYmd}T00:00:00+09:00`);
    return Math.floor((target.getTime() - start.getTime()) / (24 * 3600 * 1000));
  };

  const messages: string[] = [];
  // 환영(welcome) 인사는 '입장 가능한' 회원에게만 재생. 만료 안내가 나가는 회원에겐
  // 붙이지 않는다(만료되었습니다 뒤에 '환영합니다'가 따라오는 문제 방지).
  // 만료 판정은 아래 터치설정 블록에서 이뤄지므로, 여기선 후보만 모아두고 마지막에 결정.
  const pendingWelcome: string[] = [];
  let expiredAnnounced = false;

  const substitute = (raw: string) => raw.replace(/\{name\}/g, member.name).trim();

  for (const rule of typedRules) {
    switch (rule.trigger_type) {
      case "welcome": {
        pendingWelcome.push(substitute(rule.message));
        break;
      }
      case "birthday": {
        const birth = (member.birth || "").slice(5, 10); // MM-DD
        if (birth && birth === todayMonthDay) {
          messages.push(substitute(rule.message));
        }
        break;
      }
      case "expiring_membership": {
        const n = rule.threshold_int ?? 0;
        // 무기한 (9999-12-31) 은 제외. n일 이내 만료면 매칭.
        const hit = memberships.some((m) => {
          if (!m.expires_at || m.expires_at.startsWith("9999")) return false;
          const d = daysUntil(m.expires_at);
          return d >= 0 && d <= n;
        });
        if (hit) messages.push(substitute(rule.message));
        break;
      }
      case "expiring_pass": {
        const n = rule.threshold_int ?? 0;
        const hit = passes.some((p) => {
          if (!p.expires_at || p.expires_at.startsWith("9999")) return false;
          const d = daysUntil(p.expires_at);
          return d >= 0 && d <= n;
        });
        if (hit) messages.push(substitute(rule.message));
        break;
      }
      case "low_pass_sessions": {
        const n = rule.threshold_int ?? 0;
        const hit = passes.some(
          (p) => Number(p.remaining_sessions ?? 0) > 0 && Number(p.remaining_sessions ?? 0) <= n
        );
        if (hit) messages.push(substitute(rule.message));
        break;
      }
    }
  }

  // 터치출석 설정(crm_touch_attendance_settings) 기반 안내 멘트 일괄 평가.
  // 실패해도 다른 메세지에 영향 없도록 try/catch. (퇴장 멘트 msg_exit 은 체크아웃
  // 플로우가 없어 여기서 재생하지 않음 — 별도 기능 필요.)
  try {
    const { data: st } = await supabase
      .from("crm_touch_attendance_settings")
      .select(
        "msg_active_entry, msg_active_entry_enabled, msg_birthday_entry, msg_birthday_entry_enabled, msg_expiring_membership, msg_expiring_membership_enabled, expiring_threshold_days, msg_outstanding, msg_outstanding_enabled, msg_holding, msg_holding_enabled, msg_scheduled_membership, msg_scheduled_membership_enabled, msg_expired_membership, msg_expired_membership_enabled, msg_expired_rental, msg_expired_rental_enabled, msg_expired_rental_days, msg_expired_locker, msg_expired_locker_enabled, msg_expired_locker_days"
      )
      .eq("center_id", centerId)
      .maybeSingle();

    if (st) {
      const s = st as Record<string, string | boolean | number | null | undefined>;
      // 활성화 + 문구 존재 여부
      const on = (key: string) =>
        !!s[`${key}_enabled`] && String(s[key] ?? "").trim().length > 0;
      const txt = (key: string) => substitute(String(s[key] ?? ""));

      // 만료 임박 기준일 = 터치출석 설정(expiring_threshold_days). 미설정이면 기본 7일.
      const EXPIRING_DEFAULT_DAYS = Math.max(1, Number(s.expiring_threshold_days ?? 0) || 7);

      // 만료 후 N일 이내인지: expires_at < 오늘 && (N=0 || 만료 경과일 <= N)
      const isExpiredWithin = (ymd: string, days: number): boolean => {
        if (!ymd || ymd.startsWith("9999")) return false;
        const d = daysUntil(ymd);
        if (d >= 0) return false;
        return days <= 0 || d >= -days;
      };

      const needMs =
        on("msg_active_entry") ||
        on("msg_expiring_membership") ||
        on("msg_outstanding") ||
        on("msg_holding") ||
        on("msg_scheduled_membership") ||
        on("msg_expired_membership");

      const [msRes, passesOutRes, rentalsRes, lockersRes] = await Promise.all([
        needMs
          ? supabase
              .from("crm_memberships")
              .select("expires_at, start_date, status, is_paused, outstanding_won")
              .eq("center_id", centerId)
              .eq("member_id", member.id)
              .in("status", ["valid", "expired"])
          : Promise.resolve({ data: [] as MsRow[] }),
        on("msg_outstanding")
          ? supabase
              .from("crm_passes")
              .select("outstanding_won")
              .eq("center_id", centerId)
              .eq("member_id", member.id)
              .in("status", ["valid", "expired"])
          : Promise.resolve({ data: [] as { outstanding_won: number }[] }),
        on("msg_expired_rental")
          ? supabase
              .from("crm_rentals")
              .select("expires_at")
              .eq("center_id", centerId)
              .eq("member_id", member.id)
              .eq("status", "active")
          : Promise.resolve({ data: [] as { expires_at: string }[] }),
        on("msg_expired_locker")
          ? supabase
              .from("crm_lockers")
              .select("expires_at")
              .eq("center_id", centerId)
              .eq("assigned_member_id", member.id)
          : Promise.resolve({ data: [] as { expires_at: string }[] }),
      ]);

      const ms = (msRes.data ?? []) as MsRow[];
      const unlimited = (m: MsRow) => !!m.expires_at && m.expires_at.startsWith("9999");
      const notStarted = (m: MsRow) => !!m.start_date && daysUntil(m.start_date) > 0;
      const dateExpired = (m: MsRow) =>
        !!m.expires_at && !unlimited(m) && daysUntil(m.expires_at) < 0;
      const valids = ms.filter((m) => m.status === "valid");

      const hasActive = valids.some(
        (m) => !m.is_paused && !notStarted(m) && (unlimited(m) || daysUntil(m.expires_at) >= 0)
      );
      const hasHolding = valids.some((m) => m.is_paused && !dateExpired(m));
      const hasScheduled = valids.some((m) => !m.is_paused && notStarted(m));
      const hasExpiringSoon = valids.some(
        (m) =>
          !m.is_paused &&
          !notStarted(m) &&
          !unlimited(m) &&
          daysUntil(m.expires_at) >= 0 &&
          daysUntil(m.expires_at) <= EXPIRING_DEFAULT_DAYS
      );
      const hasOutstanding =
        ms.some((m) => Number(m.outstanding_won ?? 0) > 0) ||
        ((passesOutRes.data ?? []) as { outstanding_won: number }[]).some(
          (p) => Number(p.outstanding_won ?? 0) > 0
        );

      // 사용 가능한(활성/예정/홀딩) 회원권이 하나도 없음 = 회원권 없음/만료 상태.
      // 이 경우 '만료 회원 입장' 멘트를 우선 안내한다(설정 ON일 때).
      // 예외: 유효한 수강권 + 오늘 예약된 수업이 있으면(정상 PT 방문) 안내 생략.
      const noUsableMembership = !hasActive && !hasScheduled && !hasHolding;
      let skipExpiredForClass = false;
      if (on("msg_expired_membership") && noUsableMembership) {
        const tomorrowYmd = (() => {
          const t = new Date(`${todayYmd}T00:00:00Z`);
          t.setUTCDate(t.getUTCDate() + 1);
          return t.toISOString().slice(0, 10);
        })();
        const [validPassRes, todayClassRes] = await Promise.all([
          supabase
            .from("crm_passes")
            .select("id")
            .eq("center_id", centerId)
            .eq("member_id", member.id)
            .eq("status", "valid")
            .limit(1),
          supabase
            .from("crm_reservations")
            .select("id")
            .eq("center_id", centerId)
            .eq("member_id", member.id)
            .in("status", ["booked", "attended"])
            .gte("starts_at", `${todayYmd}T00:00:00+09:00`)
            .lt("starts_at", `${tomorrowYmd}T00:00:00+09:00`)
            .limit(1),
        ]);
        const hasValidPass = ((validPassRes.data ?? []) as unknown[]).length > 0;
        const hasClassToday = ((todayClassRes.data ?? []) as unknown[]).length > 0;
        skipExpiredForClass = hasValidPass && hasClassToday;
      }

      // 생일
      if (on("msg_birthday_entry")) {
        const birth = (member.birth || "").slice(5, 10);
        if (birth && birth === todayMonthDay) messages.push(txt("msg_birthday_entry"));
      }
      // 회원 상태 인사(상호 배타): 활성 / 예정 / 홀딩 / 만료(=회원권 없음)
      if (on("msg_active_entry") && hasActive) {
        messages.push(txt("msg_active_entry"));
      } else if (on("msg_scheduled_membership") && hasScheduled) {
        messages.push(txt("msg_scheduled_membership"));
      } else if (on("msg_holding") && hasHolding) {
        messages.push(txt("msg_holding"));
      } else if (on("msg_expired_membership") && noUsableMembership && !skipExpiredForClass) {
        // 회원권 없음/만료(활성·예정·홀딩 전무) → 최우선 안내.
        // hasExpired(만료 기록) 여부와 무관하게, 유효 회원권이 없으면 무조건 안내.
        messages.unshift(txt("msg_expired_membership"));
        expiredAnnounced = true; // 이 회원에겐 환영 인사를 붙이지 않음
      }
      // 만료 임박(활성 회원 대상 추가 안내)
      if (on("msg_expiring_membership") && hasExpiringSoon) {
        messages.push(txt("msg_expiring_membership"));
      }
      // 미수금
      if (on("msg_outstanding") && hasOutstanding) {
        messages.push(txt("msg_outstanding"));
      }
      // 운동복(대여권) 만료
      if (on("msg_expired_rental")) {
        const days = Number(s.msg_expired_rental_days ?? 0);
        const hit = ((rentalsRes.data ?? []) as { expires_at: string }[]).some((r) =>
          isExpiredWithin(r.expires_at, days)
        );
        if (hit) messages.push(txt("msg_expired_rental"));
      }
      // 락커 만료
      if (on("msg_expired_locker")) {
        const days = Number(s.msg_expired_locker_days ?? 0);
        const hit = ((lockersRes.data ?? []) as { expires_at: string }[]).some((l) =>
          isExpiredWithin(l.expires_at, days)
        );
        if (hit) messages.push(txt("msg_expired_locker"));
      }
    }
  } catch {
    /* 설정 없거나 조회 실패 — 터치설정 안내 스킵 */
  }

  // 환영 인사 최종 결정: 만료 안내가 나간 회원(입장 불가)에겐 재생하지 않고,
  // 그 외에는 맨 앞에 붙인다(기존처럼 인사말 우선).
  if (pendingWelcome.length > 0 && !expiredAnnounced) {
    messages.unshift(...pendingWelcome);
  }

  return messages;
}

interface MsRow {
  expires_at: string;
  start_date: string;
  status: string;
  is_paused: boolean;
  outstanding_won: number;
}
