import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/attendances/register-face
 * body: { member_id, face_image_data(dataURL), face_image_thumb(dataURL) }
 *
 * 터치출석 현장에서 얼굴 미등록 회원이 본인 동의 후 얼굴을 촬영해 등록.
 * 생체정보(얼굴) 수집 동의 시각(face_consent_at)을 함께 기록.
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  let body: { member_id?: number; face_image_data?: string; face_image_thumb?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const memberId = Number(body.member_id);
  const data = body.face_image_data;
  const thumb = body.face_image_thumb;
  if (!memberId || !data || !data.startsWith("data:image")) {
    return NextResponse.json({ error: "회원과 얼굴 이미지가 필요합니다" }, { status: 400 });
  }
  // 과도한 크기 방지 (대략 300KB base64 상한)
  if (data.length > 400_000) {
    return NextResponse.json({ error: "이미지 용량이 너무 큽니다" }, { status: 400 });
  }

  // 본 센터 소속 활성 회원인지 확인
  const { data: member } = await supabase
    .from("crm_members")
    .select("id")
    .eq("id", memberId)
    .eq("center_id", ctx.centerId)
    .eq("status", "active")
    .maybeSingle();
  if (!member) {
    return NextResponse.json({ error: "회원을 찾을 수 없습니다" }, { status: 404 });
  }

  const { error } = await supabase
    .from("crm_members")
    .update({
      face_image_data: data,
      face_image_thumb: thumb || data,
      face_consent_at: new Date().toISOString(),
    } as never)
    .eq("id", memberId)
    .eq("center_id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "얼굴 등록 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "member.face_register",
    entity_type: "member",
    entity_id: memberId,
    payload: { via: "touch_attendance", consent: true } as never,
  });

  return NextResponse.json({ ok: true });
}
