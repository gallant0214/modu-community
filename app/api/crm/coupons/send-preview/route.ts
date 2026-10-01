import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { resolveAudience } from "@/app/api/crm/messages/route";
import { effectiveStatus } from "@/app/lib/crm-coupons";
import { loadCoupons, loadMemberNames, paginateAll } from "@/app/lib/crm-coupons-db";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/coupons/send-preview
 * body: { coupon_id, audience_kind, member_ids?, within_days?, inactive_days? }
 *
 * 쿠폰을 보내기 전에 **누구에게 가는지** 명단을 보여주기 위한 조회.
 * 1인 1장 쿠폰이면 이미 들고 있는 회원을 alreadyHas 로 표시해 발송 대상에서 빠지는 것을 알린다.
 * (실제 발송 때도 서버가 같은 규칙으로 다시 걸러낸다)
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "coupons.send"))) {
    return NextResponse.json({ error: "쿠폰 발송 권한이 없습니다" }, { status: 403 });
  }

  let body: {
    coupon_id?: number;
    audience_kind?: string;
    member_ids?: number[];
    within_days?: number;
    inactive_days?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const kind = body.audience_kind ?? "";
  const validKinds = ["all", "active", "expiring", "expired", "unassigned", "individual", "dormant"];
  if (!validKinds.includes(kind)) {
    return NextResponse.json({ error: "대상 유형이 잘못됨" }, { status: 400 });
  }

  const memberIds = await resolveAudience(ctx.centerId, kind, {
    member_ids: body.member_ids ?? [],
    within_days: Math.max(1, Math.min(60, body.within_days ?? 7)),
    inactive_days: Math.max(1, Math.min(365, body.inactive_days ?? 14)),
  });

  // 1인 1장 쿠폰이면 이미 쓸 수 있는 쿠폰을 들고 있는 회원 표시
  const couponId = Number(body.coupon_id) || 0;
  const coupon = couponId ? (await loadCoupons(ctx.centerId, [couponId])).get(couponId) : undefined;
  const holding = new Set<number>();
  if (coupon?.one_per_member && memberIds.length > 0) {
    const held = await paginateAll<{ member_id: number; status: string; expires_at: string | null }>((f, t) =>
      supabase
        .from("crm_coupon_issues")
        .select("member_id, status, expires_at")
        .eq("coupon_id", couponId)
        .eq("status", "issued")
        .range(f, t)
    );
    for (const h of held) if (effectiveStatus(h) === "issued") holding.add(h.member_id);
  }

  const names = await loadMemberNames(ctx.centerId, memberIds);
  const recipients = memberIds
    .map((id) => ({
      id,
      name: names.get(id)?.name ?? "(이름 없음)",
      phone: names.get(id)?.phone ?? null,
      alreadyHas: holding.has(id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  return NextResponse.json({
    recipients,
    count: recipients.length,
    alreadyHasCount: recipients.filter((r) => r.alreadyHas).length,
    onePerMember: !!coupon?.one_per_member,
  });
}
