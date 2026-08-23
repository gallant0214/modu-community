import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/members/[id]/workout-logs
 * 회원의 운동 기록(간이 메모) 목록. 최신순 100건.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  const { id } = await params;
  const memberId = Number(id);
  if (!memberId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { data, error } = await supabase
    .from("crm_member_workout_logs")
    .select("id, log_date, memo, created_by_uid, created_at, updated_at")
    .eq("center_id", ctx.centerId)
    .eq("member_id", memberId)
    .order("log_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(100);
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ logs: data ?? [] });
}

/**
 * POST /api/crm/members/[id]/workout-logs
 * body: { log_date?: YYYY-MM-DD, memo: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "members.records"))) {
    return NextResponse.json({ error: "운동기록·체성분 수정 권한이 없습니다" }, { status: 403 });
  }
  const { id } = await params;
  const memberId = Number(id);
  if (!memberId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  let body: { log_date?: string; memo?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const memo = (body.memo ?? "").trim();
  if (!memo) return NextResponse.json({ error: "운동 내용을 입력해 주세요" }, { status: 400 });

  const logDate = /^\d{4}-\d{2}-\d{2}$/.test(body.log_date ?? "")
    ? (body.log_date as string)
    : new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // KST 오늘

  // 회원이 이 센터 소속인지 검증
  const { data: mem } = await supabase
    .from("crm_members")
    .select("id")
    .eq("id", memberId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!mem) return NextResponse.json({ error: "회원을 찾을 수 없습니다" }, { status: 404 });

  const { data: created, error } = await supabase
    .from("crm_member_workout_logs")
    .insert({
      center_id: ctx.centerId,
      member_id: memberId,
      log_date: logDate,
      memo: memo.slice(0, 5000),
      created_by_uid: ctx.uid,
    })
    .select("id, log_date, memo, created_by_uid, created_at, updated_at")
    .single();
  if (error || !created) {
    return NextResponse.json({ error: "저장 실패", detail: error?.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "workout_log.create",
    entity_type: "crm_member_workout_logs",
    entity_id: created.id,
    payload: { member_id: memberId, log_date: logDate } as never,
  });

  return NextResponse.json({ ok: true, log: created });
}
