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

  const substitute = (raw: string) => raw.replace(/\{name\}/g, member.name).trim();

  for (const rule of typedRules) {
    switch (rule.trigger_type) {
      case "welcome": {
        messages.push(substitute(rule.message));
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

  // 만료 운동복(대여권)·락커 안내 — 터치출석 설정(crm_touch_attendance_settings) 기반.
  // "만료 후 N일까지" 안내(N=0 이면 만료 후 계속). 실패해도 다른 메세지에 영향 없도록 try/catch.
  try {
    const { data: st } = await supabase
      .from("crm_touch_attendance_settings")
      .select(
        "msg_expired_rental, msg_expired_rental_enabled, msg_expired_rental_days, msg_expired_locker, msg_expired_locker_enabled, msg_expired_locker_days"
      )
      .eq("center_id", centerId)
      .maybeSingle();

    if (st) {
      const s = st as {
        msg_expired_rental?: string;
        msg_expired_rental_enabled?: boolean;
        msg_expired_rental_days?: number;
        msg_expired_locker?: string;
        msg_expired_locker_enabled?: boolean;
        msg_expired_locker_days?: number;
      };
      // 만료 후 N일 이내인지: expires_at < 오늘 && (N=0 || 만료 경과일 <= N)
      const isExpiredWithin = (ymd: string, days: number): boolean => {
        if (!ymd || ymd.startsWith("9999")) return false;
        const d = daysUntil(ymd); // 과거면 음수
        if (d >= 0) return false; // 아직 유효
        return days <= 0 || d >= -days;
      };

      const needRental = s.msg_expired_rental_enabled && (s.msg_expired_rental || "").trim();
      const needLocker = s.msg_expired_locker_enabled && (s.msg_expired_locker || "").trim();

      const [rentalsRes, lockersRes] = await Promise.all([
        needRental
          ? supabase
              .from("crm_rentals")
              .select("expires_at")
              .eq("center_id", centerId)
              .eq("member_id", member.id)
              .eq("status", "active")
          : Promise.resolve({ data: [] as { expires_at: string }[] }),
        needLocker
          ? supabase
              .from("crm_lockers")
              .select("expires_at")
              .eq("center_id", centerId)
              .eq("assigned_member_id", member.id)
          : Promise.resolve({ data: [] as { expires_at: string }[] }),
      ]);

      if (needRental) {
        const days = Number(s.msg_expired_rental_days ?? 0);
        const hit = ((rentalsRes.data ?? []) as { expires_at: string }[]).some((r) =>
          isExpiredWithin(r.expires_at, days)
        );
        if (hit) messages.push(substitute(s.msg_expired_rental!));
      }
      if (needLocker) {
        const days = Number(s.msg_expired_locker_days ?? 0);
        const hit = ((lockersRes.data ?? []) as { expires_at: string }[]).some((l) =>
          isExpiredWithin(l.expires_at, days)
        );
        if (hit) messages.push(substitute(s.msg_expired_locker!));
      }
    }
  } catch {
    /* 설정 없거나 조회 실패 — 만료 안내 스킵 */
  }

  return messages;
}
