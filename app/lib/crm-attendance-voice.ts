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

  if (!rules || rules.length === 0) return [];

  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const todayYmd = kstNow.toISOString().slice(0, 10);
  const todayMonthDay = todayYmd.slice(5); // MM-DD

  // 필요한 규칙 종류에 따라 데이터 로드
  const typedRules = rules as Rule[];
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

  return messages;
}
