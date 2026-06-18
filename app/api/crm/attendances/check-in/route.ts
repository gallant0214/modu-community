import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/attendances/check-in
 * body: { token?: string, member_id?: number, source?: 'kiosk'|'manual' }
 *
 * - token 으로 회원 찾기 (QR 스캔)
 * - 또는 member_id 직접 (manual)
 * - 중복 체크: 5분 이내 동일 회원 재체크인 차단 (실수 방지)
 *
 * 응답: 성공 시 { member, attendance, recent_other_attendances }
 *       실패 시 { error }
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  let body: { token?: string; member_id?: number; source?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  let member: { id: number; name: string; phone: string | null } | null = null;

  if (body.token) {
    const { data } = await supabase
      .from("crm_members")
      .select("id, name, phone")
      .eq("center_id", ctx.centerId)
      .eq("checkin_token", body.token.trim())
      .eq("status", "active")
      .maybeSingle();
    member = data;
  } else if (body.member_id) {
    const { data } = await supabase
      .from("crm_members")
      .select("id, name, phone")
      .eq("center_id", ctx.centerId)
      .eq("id", body.member_id)
      .eq("status", "active")
      .maybeSingle();
    member = data;
  }

  if (!member) {
    return NextResponse.json({ error: "회원을 찾을 수 없습니다" }, { status: 404 });
  }

  // 중복 차단: 최근 5분 이내 같은 회원 체크인이 있으면 건너뜀
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from("crm_attendances")
    .select("id, checked_in_at")
    .eq("center_id", ctx.centerId)
    .eq("member_id", member.id)
    .gte("checked_in_at", cutoff)
    .order("checked_in_at", { ascending: false })
    .limit(1);

  if (recent && recent.length > 0) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      member,
      attendance: recent[0],
      message: "이미 최근 5분 안에 체크인 기록이 있어요.",
    });
  }

  const source = body.source === "manual" ? "manual" : "kiosk";

  const { data: created, error } = await supabase
    .from("crm_attendances")
    .insert({
      center_id: ctx.centerId,
      member_id: member.id,
      source,
    })
    .select("id, checked_in_at")
    .single();

  if (error || !created) {
    return NextResponse.json({ error: "출석 실패", detail: error?.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    member,
    attendance: created,
  });
}
