import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { SCAN_TRIGGERS, computeMatches, type TriggerSetting } from "../_engine";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/auto-messages/matches
 * 스캔 가능한 트리거별 '지금 조건에 해당하는 회원 수'를 계산해 반환.
 * → { counts: { [trigger_key]: number }, scanTriggers: string[] }
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { data: settings } = await supabase
    .from("crm_auto_message_settings")
    .select("trigger_key, send_basis, send_days, send_count")
    .eq("center_id", ctx.centerId);

  const byKey = new Map<string, TriggerSetting>();
  for (const s of (settings ?? []) as TriggerSetting[]) byKey.set(s.trigger_key, s);

  const counts: Record<string, number> = {};
  for (const key of SCAN_TRIGGERS) {
    const setting = byKey.get(key) ?? { trigger_key: key, send_basis: "immediate", send_days: null, send_count: null };
    try {
      const matches = await computeMatches(ctx.centerId, setting);
      counts[key] = matches.length;
    } catch {
      counts[key] = 0;
    }
  }

  return NextResponse.json({ counts, scanTriggers: Array.from(SCAN_TRIGGERS) });
}
