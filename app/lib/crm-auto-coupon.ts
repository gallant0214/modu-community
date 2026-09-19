import { supabase } from "@/app/lib/supabase";
import {
  benefitText,
  effectiveStatus,
  generateCouponCode,
  issueExpiryYmd,
  kstTodayYmd,
  type CouponDef,
} from "@/app/lib/crm-coupons";
import { loadCoupons } from "@/app/lib/crm-coupons-db";

/**
 * 자동 메세지 '06 쿠폰 첨부'.
 *
 * 설정(crm_auto_message_settings.coupon_id)에 쿠폰이 걸려 있으면, 발송 직전에 회원마다 쿠폰을
 * 1장 발급하고(사이드바 '쿠폰' 과 같은 crm_coupon_issues) 메세지에 쿠폰 정보를 넣는다.
 *
 * 중복 발급 방지: 대기열 행(crm_auto_message_queue.coupon_issue_id)에 발급 id 를 기록 →
 * 실패 후 재시도돼도 같은 쿠폰을 다시 쓴다. '1인 1장' 쿠폰은 아직 쓸 수 있는 걸 들고 있으면 그걸 재사용.
 */

/** 본문에 넣을 수 있는 쿠폰 변수 */
export const COUPON_VARIABLES = ["#쿠폰명#", "#쿠폰혜택#", "#쿠폰코드#", "#쿠폰기한#"] as const;

export interface CouponVars {
  name: string;
  benefit: string;
  code: string;
  expires: string; // "2026.10.19까지" 또는 "기한 없음"
}

function fmtExpiry(ymd: string | null): string {
  return ymd ? `${ymd.replace(/-/g, ".")}까지` : "기한 없음";
}

/** 쿠폰 변수 치환. 본문에 쿠폰 변수가 하나도 없으면 끝에 안내 블록을 자동으로 붙인다. */
export function applyCouponVars(message: string, v: CouponVars): string {
  const hasVar = COUPON_VARIABLES.some((k) => message.includes(k));
  const replaced = message
    .replaceAll("#쿠폰명#", v.name)
    .replaceAll("#쿠폰혜택#", v.benefit)
    .replaceAll("#쿠폰코드#", v.code)
    .replaceAll("#쿠폰기한#", v.expires);
  if (hasVar) return replaced;
  return `${replaced.trimEnd()}\n\n🎫 쿠폰이 발급됐어요\n${v.name} (${v.benefit})\n쿠폰코드 ${v.code} · ${v.expires}`;
}

/** 쿠폰이 지금 발급 가능한 상태인지 */
function usable(c: CouponDef | undefined): c is CouponDef {
  if (!c) return false;
  if ((c.status ?? "active") !== "active") return false;
  if (c.valid_mode === "until" && c.valid_until && c.valid_until < kstTodayYmd()) return false;
  return true;
}

/** 테스트 발송용 — 실제 발급 없이 예시 코드로 치환 */
export async function sampleCouponMessage(
  centerId: number,
  couponId: number | null | undefined,
  message: string
): Promise<string> {
  if (!couponId) return message;
  const c = (await loadCoupons(centerId, [couponId])).get(couponId);
  if (!usable(c)) return message;
  return applyCouponVars(message, {
    name: c.name,
    benefit: benefitText(c),
    code: "TEST-0000",
    expires: fmtExpiry(issueExpiryYmd(c)),
  });
}

/** 트리거별 쿠폰 설정 조회 (한 번의 발송 묶음 안에서 캐시) */
export async function loadTriggerCoupons(centerId: number): Promise<Map<string, number>> {
  const { data } = await supabase
    .from("crm_auto_message_settings")
    .select("trigger_key, coupon_id")
    .eq("center_id", centerId)
    .not("coupon_id", "is", null);
  const out = new Map<string, number>();
  for (const r of (data ?? []) as { trigger_key: string; coupon_id: number | null }[]) {
    if (r.coupon_id) out.set(r.trigger_key, Number(r.coupon_id));
  }
  return out;
}

/**
 * 대기열 행 1건에 쿠폰을 붙여 최종 메세지를 돌려준다. 쿠폰이 없거나 쓸 수 없으면 원문 그대로.
 * 실패해도 예외를 던지지 않는다(쿠폰 때문에 안내 메세지 자체가 막히면 안 됨).
 */
export async function attachAutoCoupon(opts: {
  centerId: number;
  queueId: number;
  memberId: number;
  couponId: number | null | undefined;
  message: string;
}): Promise<string> {
  const { centerId, queueId, memberId, couponId, message } = opts;
  if (!couponId) return message;
  try {
    const coupon = (await loadCoupons(centerId, [couponId])).get(couponId);
    const varsOf = (code: string, expiresAt: string | null): CouponVars => ({
      name: coupon?.name ?? "쿠폰",
      benefit: coupon ? benefitText(coupon) : "",
      code,
      expires: fmtExpiry(expiresAt),
    });

    // 1) 이 대기열 행에 이미 발급된 쿠폰이 있으면 그대로 사용 (재시도 시 중복 발급 방지)
    const { data: q } = await supabase
      .from("crm_auto_message_queue")
      .select("coupon_issue_id")
      .eq("id", queueId)
      .maybeSingle();
    const existingIssueId = (q as { coupon_issue_id?: number | null } | null)?.coupon_issue_id;
    if (existingIssueId) {
      const { data: iss } = await supabase
        .from("crm_coupon_issues")
        .select("code, expires_at")
        .eq("id", existingIssueId)
        .maybeSingle();
      const i = iss as { code: string; expires_at: string | null } | null;
      if (!i) return message;
      // 재시도 행은 이미 쿠폰 정보가 들어간 메세지를 들고 온다 → 다시 붙이지 않는다
      if (message.includes(i.code)) return message;
      return applyCouponVars(message, varsOf(i.code, i.expires_at));
    }

    if (!usable(coupon)) return message;

    // 2) 1인 1장: 아직 쓸 수 있는 같은 쿠폰을 들고 있으면 새로 주지 않고 그걸 안내
    let issue: { id: number; code: string; expires_at: string | null } | null = null;
    if (coupon.one_per_member) {
      const { data: held } = await supabase
        .from("crm_coupon_issues")
        .select("id, code, status, expires_at")
        .eq("coupon_id", couponId)
        .eq("member_id", memberId)
        .eq("status", "issued")
        .order("id", { ascending: false })
        .limit(5);
      const live = ((held ?? []) as { id: number; code: string; status: string; expires_at: string | null }[]).find(
        (h) => effectiveStatus(h) === "issued"
      );
      if (live) issue = live;
    }

    // 3) 새로 발급 (코드 충돌 시 재시도)
    if (!issue) {
      const expiresAt = issueExpiryYmd(coupon);
      for (let attempt = 0; attempt < 3 && !issue; attempt++) {
        const { data, error } = await supabase
          .from("crm_coupon_issues")
          .insert({
            center_id: centerId,
            coupon_id: couponId,
            member_id: memberId,
            code: generateCouponCode(),
            status: "issued",
            expires_at: expiresAt,
          } as never)
          .select("id, code, expires_at")
          .single();
        if (!error && data) issue = data as { id: number; code: string; expires_at: string | null };
      }
    }
    if (!issue) return message;

    const finalMsg = applyCouponVars(message, varsOf(issue.code, issue.expires_at));
    await supabase
      .from("crm_auto_message_queue")
      .update({ coupon_issue_id: issue.id, message: finalMsg } as never)
      .eq("id", queueId);
    return finalMsg;
  } catch (e) {
    console.error("[auto-coupon] attach error", e);
    return message;
  }
}
