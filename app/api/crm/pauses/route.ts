import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

const dayDiff = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / (24 * 3600 * 1000));

const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * GET /api/crm/pauses?member_id=&pass_id=&membership_id=
 * 홀딩 내역 조회 (취소 포함).
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const memberId = url.searchParams.get("member_id");
  const passId = url.searchParams.get("pass_id");
  const membershipId = url.searchParams.get("membership_id");

  let q = supabase
    .from("crm_pauses")
    .select(
      "id, member_id, pass_id, membership_id, start_date, end_date, reason, requested_by, status, extended_days, created_at, cancelled_at"
    )
    .eq("center_id", ctx.centerId)
    .order("start_date", { ascending: false })
    .limit(200);

  if (memberId) q = q.eq("member_id", Number(memberId));
  if (passId) q = q.eq("pass_id", Number(passId));
  if (membershipId) q = q.eq("membership_id", Number(membershipId));

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ pauses: data ?? [] });
}

/**
 * POST /api/crm/pauses — 홀딩 시작
 *
 * Body: { pass_id?, membership_id?, start_date, end_date, reason?, requested_by? }
 * - 시작/종료일로 즉시 expires_at 을 (end - start + 1) 일 만큼 연장
 * - is_paused = true 로 표시
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  let body: {
    pass_id?: number;
    membership_id?: number;
    start_date?: string;
    end_date?: string;
    reason?: string;
    requested_by?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const passId = body.pass_id ? Number(body.pass_id) : null;
  const mbId = body.membership_id ? Number(body.membership_id) : null;
  if ((!passId && !mbId) || (passId && mbId)) {
    return NextResponse.json({ error: "수강권 또는 회원권 중 하나만 선택해 주세요" }, { status: 400 });
  }
  const start = body.start_date;
  const end = body.end_date;
  if (!start || !end) {
    return NextResponse.json({ error: "시작일과 종료일을 입력해 주세요" }, { status: 400 });
  }
  if (end < start) {
    return NextResponse.json({ error: "종료일이 시작일보다 빠를 수 없어요" }, { status: 400 });
  }

  const table = passId ? "crm_passes" : "crm_memberships";
  const targetId = (passId ?? mbId) as number;
  const { data: target, error: tErr } = await supabase
    .from(table)
    .select("id, member_id, expires_at, status, is_paused")
    .eq("id", targetId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (tErr || !target) {
    return NextResponse.json({ error: "대상을 찾을 수 없습니다" }, { status: 404 });
  }
  if (target.status !== "valid") {
    return NextResponse.json({ error: "유효한 수강권/회원권만 홀딩할 수 있어요" }, { status: 400 });
  }
  if (target.is_paused) {
    return NextResponse.json({ error: "이미 진행중인 홀딩이 있어요" }, { status: 400 });
  }

  const days = dayDiff(start, end) + 1; // inclusive 양 끝 포함
  const newExpires = addDays(target.expires_at, days);

  // 1) 홀딩 기록 생성
  const { data: pause, error: pErr } = await supabase
    .from("crm_pauses")
    .insert({
      center_id: ctx.centerId,
      member_id: target.member_id,
      pass_id: passId,
      membership_id: mbId,
      start_date: start,
      end_date: end,
      reason: body.reason?.trim() || null,
      requested_by: body.requested_by?.trim() || null,
      status: "active",
      extended_days: days,
      created_by_uid: ctx.uid,
    })
    .select("id")
    .single();
  if (pErr || !pause) {
    return NextResponse.json({ error: "홀딩 기록 실패", detail: pErr?.message }, { status: 500 });
  }

  // 2) 만료일 연장 + is_paused 표시
  const { error: uErr } = await supabase
    .from(table)
    .update({ expires_at: newExpires, is_paused: true } as never)
    .eq("id", targetId);
  if (uErr) {
    return NextResponse.json({ error: "상태 갱신 실패", detail: uErr.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "pause.create",
    entity_type: passId ? "crm_passes" : "crm_memberships",
    entity_id: targetId,
    payload: { start, end, days, reason: body.reason, requested_by: body.requested_by } as never,
  });

  return NextResponse.json({
    ok: true,
    pause_id: pause.id,
    new_expires_at: newExpires,
    extended_days: days,
  });
}
