import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/members/[id]/measurements
 * 회원 신체 측정 기록 시계열 (최근 20건).
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
    .from("crm_body_measurements")
    .select(
      "id, measured_at, height_cm, weight_kg, muscle_kg, body_fat_kg, body_fat_pct, bmi, visceral_fat, basal_metabolism, memo, created_at"
    )
    .eq("center_id", ctx.centerId)
    .eq("member_id", memberId)
    .order("measured_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ measurements: data ?? [] });
}

/**
 * POST /api/crm/members/[id]/measurements
 * 신체 측정 기록 추가.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const memberId = Number(id);
  if (!memberId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  let body: {
    measured_at?: string;
    height_cm?: number;
    weight_kg?: number;
    muscle_kg?: number;
    body_fat_kg?: number;
    body_fat_pct?: number;
    bmi?: number;
    visceral_fat?: number;
    basal_metabolism?: number;
    memo?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  if (!body.measured_at) {
    return NextResponse.json({ error: "측정일을 입력해 주세요" }, { status: 400 });
  }

  // 회원 본 센터 소속 확인
  const { data: m } = await supabase
    .from("crm_members")
    .select("id")
    .eq("id", memberId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!m) return NextResponse.json({ error: "회원을 찾을 수 없습니다" }, { status: 404 });

  const { data: created, error } = await supabase
    .from("crm_body_measurements")
    .insert({
      center_id: ctx.centerId,
      member_id: memberId,
      measured_at: body.measured_at,
      height_cm: body.height_cm ?? null,
      weight_kg: body.weight_kg ?? null,
      muscle_kg: body.muscle_kg ?? null,
      body_fat_kg: body.body_fat_kg ?? null,
      body_fat_pct: body.body_fat_pct ?? null,
      bmi: body.bmi ?? null,
      visceral_fat: body.visceral_fat ?? null,
      basal_metabolism: body.basal_metabolism ?? null,
      memo: body.memo?.trim() || null,
      recorded_by_uid: ctx.uid,
    })
    .select("id")
    .single();

  if (error || !created) {
    return NextResponse.json({ error: "저장 실패", detail: error?.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: created.id });
}
