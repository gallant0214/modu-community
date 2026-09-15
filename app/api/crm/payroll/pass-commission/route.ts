import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/crm/payroll/pass-commission
 * body: { pass_id, rate }  rate = 0~100(%) 또는 null(=강사 기본요율로 되돌림)
 *
 * 수강권별 강사 커미션 요율 override 설정. 급여(직원급여) 산정에 그 수강권만 이 요율로 반영.
 * 접근: 대표자/관리자만 (급여 요율 조정).
 */
export async function PATCH(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const isAdmin = ctx.accessLevel === "admin" || ctx.role === "owner" || ctx.role === "admin";
  if (!isAdmin) {
    return NextResponse.json({ error: "수업료 요율을 변경할 권한이 없습니다" }, { status: 403 });
  }

  let body: { pass_id?: number; rate?: number | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const passId = Number(body.pass_id);
  if (!passId) return NextResponse.json({ error: "수강권을 찾을 수 없습니다" }, { status: 400 });

  // rate: null → override 해제. 숫자면 0~100 범위로 클램프.
  let rate: number | null = null;
  if (body.rate !== null && body.rate !== undefined && body.rate !== ("" as never)) {
    const n = Number(body.rate);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return NextResponse.json({ error: "요율은 0~100 사이여야 합니다" }, { status: 400 });
    }
    rate = Math.round(n * 100) / 100;
  }

  // 센터 소속 수강권인지 확인
  const { data: pass } = await supabase
    .from("crm_passes")
    .select("id, commission_rate")
    .eq("id", passId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!pass) return NextResponse.json({ error: "수강권을 찾을 수 없습니다" }, { status: 404 });

  const { error } = await supabase
    .from("crm_passes")
    .update({ commission_rate: rate } as never)
    .eq("id", passId)
    .eq("center_id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "저장 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "pass.update",
    entity_type: "pass",
    entity_id: passId,
    payload: {
      changes: {
        commission_rate: {
          from: (pass as { commission_rate?: number | null }).commission_rate ?? null,
          to: rate,
        },
      },
    },
  } as never);

  return NextResponse.json({ ok: true, commission_rate: rate });
}
