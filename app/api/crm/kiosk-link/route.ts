import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { makeWeeklyQrToken, nextBucketBoundaryMs } from "@/app/lib/kiosk-auth";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/kiosk-link  → 현재 터치출석 QR 토큰 반환(없으면 즉석 발급).
 * POST /api/crm/kiosk-link → 새 토큰 발급/재발급(기존 링크 즉시 무효화).
 * 권한: GET=터치출석 운영(attendance.manage) — 강사도 QR 모드 사용 가능.
 *       POST(재발급)=owner/admin(settings.edit) — 인쇄된 QR 무효화되므로 관리자 전용.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  // 터치출석 키오스크 운영 권한이면 QR 표시용 토큰 조회 허용.
  if (!(await ctxHasPermission(ctx, "attendance.manage"))) {
    return NextResponse.json({ error: "출석 관리 권한이 없습니다" }, { status: 403 });
  }

  const { data } = await supabase
    .from("crm_centers")
    .select("kiosk_token")
    .eq("id", ctx.centerId)
    .maybeSingle();
  let kioskToken = (data as { kiosk_token: string | null } | null)?.kiosk_token ?? null;

  // 토큰이 아직 없으면 즉석 발급 — 권한만 있으면 QR 모드가 바로 동작하도록.
  if (!kioskToken) {
    const fresh = crypto.randomBytes(24).toString("hex");
    // 동시 요청 레이스 방지: 여전히 null 일 때만 기록.
    await supabase
      .from("crm_centers")
      .update({ kiosk_token: fresh } as never)
      .eq("id", ctx.centerId)
      .is("kiosk_token", null);
    const { data: re } = await supabase
      .from("crm_centers")
      .select("kiosk_token")
      .eq("id", ctx.centerId)
      .maybeSingle();
    kioskToken = (re as { kiosk_token: string | null } | null)?.kiosk_token ?? fresh;
  }

  // QR 은 정적 토큰이 아니라 '주간 회전 토큰' 을 사용 → 매주 자동 변경(스크린샷 무효화).
  const qr = kioskToken ? makeWeeklyQrToken(ctx.centerId, kioskToken) : null;
  return NextResponse.json({
    token: kioskToken,
    qr,
    next_rotate_at: kioskToken ? new Date(nextBucketBoundaryMs()).toISOString() : null,
  });
}

export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "settings.edit"))) {
    return NextResponse.json({ error: "센터 설정 권한이 없습니다" }, { status: 403 });
  }

  const token = crypto.randomBytes(24).toString("hex"); // 48자
  const { error } = await supabase
    .from("crm_centers")
    .update({ kiosk_token: token } as never)
    .eq("id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "링크 발급 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "kiosk_link.regenerate",
    entity_type: "crm_centers",
    entity_id: ctx.centerId,
    payload: {} as never,
  });

  return NextResponse.json({ token });
}
