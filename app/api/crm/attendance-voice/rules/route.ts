import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

const RULE_COLUMNS =
  "id, trigger_type, threshold_int, message, enabled, sort_order" as unknown as "*";

const ALLOWED_TRIGGERS = new Set([
  "welcome",
  "expiring_membership",
  "expiring_pass",
  "low_pass_sessions",
  "birthday",
]);

interface RuleInput {
  id?: number;
  trigger_type: string;
  threshold_int?: number | null;
  message: string;
  enabled?: boolean;
  sort_order?: number;
}

/**
 * GET /api/crm/attendance-voice/rules — 센터의 출석 음성 규칙 목록
 * 접근: 센터 소속 누구나 조회(안내 문구는 민감 정보 아님).
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { data, error } = await supabase
    .from("crm_attendance_voice_rules")
    .select(RULE_COLUMNS)
    .eq("center_id", ctx.centerId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ rules: data ?? [] });
}

/**
 * PUT /api/crm/attendance-voice/rules — 규칙 일괄 교체 (owner/admin 만)
 * body: { rules: RuleInput[] }
 */
export async function PUT(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  let body: { rules?: RuleInput[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const rules = Array.isArray(body.rules) ? body.rules : [];
  const clean: {
    center_id: number;
    trigger_type: string;
    threshold_int: number | null;
    message: string;
    enabled: boolean;
    sort_order: number;
  }[] = [];

  for (const [i, r] of rules.entries()) {
    if (!r || typeof r.message !== "string") continue;
    const trigger = String(r.trigger_type || "");
    if (!ALLOWED_TRIGGERS.has(trigger)) {
      return NextResponse.json({ error: `잘못된 트리거: ${trigger}` }, { status: 400 });
    }
    const message = r.message.trim().slice(0, 200);
    if (!message) continue;
    // welcome / birthday 는 threshold_int 를 무시
    const needsThreshold =
      trigger === "expiring_membership" ||
      trigger === "expiring_pass" ||
      trigger === "low_pass_sessions";
    const threshold =
      needsThreshold && r.threshold_int != null
        ? Math.max(0, Math.floor(Number(r.threshold_int) || 0))
        : null;
    if (needsThreshold && threshold == null) {
      return NextResponse.json(
        { error: "임계값(일수 또는 회수)을 입력해 주세요" },
        { status: 400 }
      );
    }
    clean.push({
      center_id: ctx.centerId,
      trigger_type: trigger,
      threshold_int: threshold,
      message,
      enabled: r.enabled !== false,
      sort_order: Number.isFinite(r.sort_order) ? Number(r.sort_order) : i,
    });
  }

  // 트랜잭션 대신 delete-then-insert (센터별 소규모 — 수십건 이내).
  const { error: delErr } = await supabase
    .from("crm_attendance_voice_rules")
    .delete()
    .eq("center_id", ctx.centerId);
  if (delErr) {
    return NextResponse.json({ error: "삭제 실패", detail: delErr.message }, { status: 500 });
  }

  if (clean.length > 0) {
    const { error: insErr } = await supabase
      .from("crm_attendance_voice_rules")
      .insert(clean as never);
    if (insErr) {
      return NextResponse.json({ error: "저장 실패", detail: insErr.message }, { status: 500 });
    }
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "attendance_voice.rules.replace",
    entity_type: "crm_attendance_voice_rules",
    entity_id: ctx.centerId,
    payload: { count: clean.length } as never,
  });

  return NextResponse.json({ ok: true, count: clean.length });
}
