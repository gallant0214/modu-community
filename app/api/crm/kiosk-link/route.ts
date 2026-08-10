import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/kiosk-link  → 현재 공개 터치출석 링크 토큰 반환(없으면 null).
 * POST /api/crm/kiosk-link → 새 토큰 발급/재발급(기존 링크 즉시 무효화).
 * 권한: owner/admin (센터 설정 관리자).
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { data } = await supabase
    .from("crm_centers")
    .select("kiosk_token")
    .eq("id", ctx.centerId)
    .maybeSingle();
  return NextResponse.json({ token: (data as { kiosk_token: string | null } | null)?.kiosk_token ?? null });
}

export async function POST(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

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
