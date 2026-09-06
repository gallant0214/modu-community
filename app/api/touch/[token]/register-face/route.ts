import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { resolveKioskCenter } from "@/app/lib/kiosk-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/touch/[token]/register-face
 * body: { member_id, face_image_data(dataURL), face_image_thumb(dataURL) }
 *
 * 공개 터치링크(로그인 없음)에서 얼굴 미등록 회원이 현장 촬영 → 그 센터 회원의 얼굴로 저장.
 * kioskToken 이 가리키는 센터의 활성 회원만 대상. (사진 노출이 아니라 '쓰기'라 번호전용 정책과 별개)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const center = await resolveKioskCenter(token);
  if (!center) {
    return NextResponse.json({ error: "유효하지 않은 링크예요" }, { status: 404 });
  }

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
  if (data.length > 400_000) {
    return NextResponse.json({ error: "이미지 용량이 너무 큽니다" }, { status: 400 });
  }

  // 토큰 센터 소속 활성 회원인지 확인 (다른 센터 회원 사진 저장 차단)
  const { data: member } = await supabase
    .from("crm_members")
    .select("id")
    .eq("id", memberId)
    .eq("center_id", center.centerId)
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
    .eq("center_id", center.centerId);
  if (error) {
    return NextResponse.json({ error: "얼굴 등록 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: center.centerId,
    actor_uid: null,
    action: "member.face_register",
    entity_type: "member",
    entity_id: memberId,
    payload: { via: "touch_kiosk", consent: true },
  } as never);

  return NextResponse.json({ ok: true });
}
